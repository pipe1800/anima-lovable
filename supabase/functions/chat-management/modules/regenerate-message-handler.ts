import { createErrorResponse } from '../../_shared/auth.ts';
import { createStreamingErrorResponse, processStreamBuffer, parseStreamChunk } from './streaming.ts';
import type { RegenerateMessageRequest } from '../types/index.ts';
import { 
  fetchCharacterData,
  fetchConversationHistory,
  fetchUserProfile,
  fetchUserGlobalSettings,
  fetchUserCharacterSettings,
  fetchUserSelectedWorldInfo,
  fetchSelectedPersona,
  fetchChatSelectedPersona,
  fetchCurrentContext,
  fetchCharacterMemories,
  getNextMessageOrder,
  createPlaceholderMessage,
  updateMessageContent,
  saveCharacterMessage,
  updateChatLastActivity,
  replaceTemplates
} from './database.ts';
import { assembleConversation } from './conversation-assembler.ts';
import { anyAddonEnabled, mapGlobalSettingsToAddonSettings, sanitizeAddonSettings } from '../../_shared/settings-mapper.ts';
import { generateAIResponse } from './message-handler.ts';

export async function handleRegenerateMessage(
  request: RegenerateMessageRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any,
  req: Request
): Promise<Response> {
  try {
    const { chatId, aiMessageId, characterId, selectedPersonaId, selectedWorldInfoId, addonSettings } = request;
    if (!chatId || !aiMessageId || !characterId) {
      return createErrorResponse('Missing required fields', 400);
    }

    // Lookup the AI message to regenerate to get its order
    const { data: aiMsg, error: fetchErr } = await supabaseAdmin
      .from('messages')
      .select('id, message_order, is_ai_message')
      .eq('id', aiMessageId)
      .single();
    if (fetchErr || !aiMsg || !aiMsg.is_ai_message) {
      return createErrorResponse('Message not found or not AI', 404);
    }

    // Mark existing message as placeholder and clear content (preserve id and position)
    const { error: updErr } = await supabaseAdmin
      .from('messages')
      .update({ content: '', is_placeholder: true, updated_at: new Date().toISOString() })
      .eq('id', aiMessageId);
    if (updErr) {
      console.error('Failed to mark message as placeholder:', updErr);
      return createErrorResponse('Failed to prepare regeneration', 500);
    }

    // Fetch required data (similar to send-message)
    const [
      character,
      messageHistory,
      userProfile,
      globalSettings,
      userCharacterSettings,
      chatSelectedPersona,
      planAndModel,
      worldInfoEntries,
      characterMemories
    ] = await Promise.all([
      fetchCharacterData(characterId, supabaseAdmin),
      fetchConversationHistory(chatId, supabase),
      fetchUserProfile(user.id, supabase),
      fetchUserGlobalSettings(user.id, supabaseAdmin),
      fetchUserCharacterSettings(user.id, characterId, supabaseAdmin),
      fetchChatSelectedPersona(chatId, user.id, supabase),
      (async () => {
        const { data, error } = await supabaseAdmin
          .from('models')
          .select('model_identifier as model, max_context_tokens')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (error || !data) {
          return { model: 'openrouter/auto', maxContextTokens: 12000, plan: 'free' } as any;
        }
        return { model: data.model, maxContextTokens: data.max_context_tokens, plan: 'user-plan' } as any;
      })(),
      fetchUserSelectedWorldInfo(user.id, characterId, selectedWorldInfoId || null, supabase),
      fetchCharacterMemories(user.id, characterId, supabase, { chatId, includeAutoSummaries: true, limitNonAuto: 30, limitAuto: 5 })
    ]);

    const selectedPersona = chatSelectedPersona || (selectedPersonaId ? await fetchSelectedPersona(selectedPersonaId, user.id, supabase) : null);

    const effectiveAddonSettings = sanitizeAddonSettings(globalSettings ? mapGlobalSettingsToAddonSettings(globalSettings) : (addonSettings || {}));
    if (userCharacterSettings?.time_awareness_enabled) {
      (effectiveAddonSettings as any).timeAwareness = true;
    }

    const addonsActive = anyAddonEnabled(effectiveAddonSettings);

    const templateContext = {
      userName: selectedPersona?.name || userProfile?.username || 'User',
      charName: character.personality_summary?.split(' ')[0] || 'Character'
    };

    const currentContext = await fetchCurrentContext(user.id, chatId, characterId, supabase);

    // Filter out the AI message being regenerated from history
    const filteredHistory = (messageHistory || []).filter((m: any) => m.message_order !== aiMsg.message_order);

    // Use the last user message content as the prompt (no new user message record will be created)
    const lastUserInHistory = [...filteredHistory].reverse().find((m: any) => !m.is_ai_message);
    const userMessage = lastUserInHistory?.content || '';

    const { conversationResult } = await assembleConversation({
      character,
      addonSettings: effectiveAddonSettings,
      templateContext,
      currentContext,
      selectedPersona,
      replaceTemplatesFn: (content) => replaceTemplates(content, templateContext),
      supabase,
      worldInfoEntries,
      userMessage,
      messageHistory: filteredHistory,
      characterMemories: characterMemories || undefined,
      chatMode: userCharacterSettings?.chat_mode || 'storytelling',
      chatId,
      userId: user.id,
      maxContextTokens: planAndModel.maxContextTokens
    });

    const openRouterKey = (() => {
      try { return globalThis.Deno?.env?.get('OPENROUTER_API_KEY'); } catch { return process?.env?.OPENROUTER_API_KEY; }
    })();
    if (!openRouterKey) return createErrorResponse('OpenRouter API key not configured', 500);

    const aiResponse = await generateAIResponse(conversationResult.messages, planAndModel.model, openRouterKey);
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return createStreamingErrorResponse(`Status: ${aiResponse.status} - ${errorText}`, planAndModel.model, planAndModel.plan);
    }

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = aiResponse.body?.getReader();
          if (!reader) throw new Error('No reader available');
          let fullResponse = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += new TextDecoder().decode(value, { stream: true });
            const { lines, remainingBuffer } = processStreamBuffer(buffer);
            buffer = remainingBuffer;

            for (const line of lines) {
              if (!line.trim()) continue;
              const { content, isDone } = parseStreamChunk(line);
              if (isDone) {
                const final = fullResponse.trim();
                if (final) {
                  await updateMessageContent(supabaseAdmin, aiMessageId, final);
                  const basicContext = {
                    moodTracking: 'No context',
                    clothingInventory: 'No context',
                    locationTracking: 'No context',
                    timeAndWeather: 'No context',
                    relationshipStatus: 'No context',
                    characterPosition: 'No context'
                  } as any;
                  await saveCharacterMessage(supabase, supabaseAdmin, user.id, chatId, final, basicContext, aiMessageId, aiMsg.message_order);
                  await updateChatLastActivity(supabase, chatId, characterId);
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                controller.close();
                return;
              }
              if (content) {
                fullResponse += content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            }
          }
        } catch (err) {
          controller.error(err);
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  } catch (error) {
    console.error('Regenerate handler error:', error);
    return createStreamingErrorResponse(error instanceof Error ? error.message : 'Internal server error', 'unknown', 'unknown');
  }
}
