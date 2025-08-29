import { createErrorResponse } from '../../_shared/auth.ts';
import { createStreamingErrorResponse, streamAIResponse } from './streaming.ts';
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
  saveCharacterMessage,
  updateChatLastActivity,
  buildTemplateReplacer
} from './database.ts';
import { assembleConversation } from './conversation-assembler.ts';
import { anyAddonEnabled, mapGlobalSettingsToAddonSettings, sanitizeAddonSettings } from '../../_shared/settings-mapper.ts';
import { generateAIResponse } from './message-handler.ts';
import { getEnv } from '../../_shared/env.ts';

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
      charName: character.name || 'Character'
    };

    const currentContext = await fetchCurrentContext(user.id, chatId, characterId, supabase);

    // Filter out the AI message being regenerated from history (keep original in place until new saved)
    const filteredHistory = (messageHistory || []).filter((m: any) => m.message_order !== aiMsg.message_order);

    // Use the last user message content as the prompt (no new user message record will be created)
    const lastUserInHistory = [...filteredHistory].reverse().find((m: any) => !m.is_ai_message);
    const userMessage = lastUserInHistory?.content || '';

    // Fetch relationship progress for regeneration prompt (no meta persistence)
    let relationshipProgress: any = null;
    try {
      const { data: relRow } = await supabaseAdmin
        .from('user_character_relationship_progress')
        .select('state')
        .eq('user_id', user.id)
        .eq('character_id', characterId)
        .maybeSingle();
      relationshipProgress = relRow?.state || null;
    } catch {}
    if (relationshipProgress) {
      // Attach transiently so assembler can pick it up if it uses currentContext
      try { (currentContext as any)._relationshipProgress = relationshipProgress; } catch {}
    }

    const { conversationResult } = await assembleConversation({
      character,
      addonSettings: effectiveAddonSettings,
      templateContext,
      currentContext,
      selectedPersona,
      replaceTemplatesFn: buildTemplateReplacer(templateContext),
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

    const openRouterKey = getEnv('OPENROUTER_API_KEY');
    if (!openRouterKey) return createErrorResponse('OpenRouter API key not configured', 500);

    const aiResponse = await generateAIResponse(conversationResult.messages, planAndModel.model, openRouterKey);
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return createStreamingErrorResponse(`Status: ${aiResponse.status} - ${errorText}`, planAndModel.model, planAndModel.plan);
    }

    return streamAIResponse({
      aiResponse,
      async onComplete(final) {
        if (final) {
          try {
            // Save regenerated message using saveCharacterMessage
            const finalMessage = await saveCharacterMessage(
              supabaseAdmin,
              user.id,
              characterId,
              chatId,
              final,
              currentContext || {},
              aiMsg.message_order
            );
          } catch (e) {
            console.error('regen.insert.error', e);
          }
          await updateChatLastActivity(supabase, chatId, characterId);
          try {
            if (anyAddonEnabled(effectiveAddonSettings)) {
              const supabaseUrl = getEnv('SUPABASE_URL', { required: false });
              const authHeader = req.headers.get('authorization');
              await fetch(`${supabaseUrl}/functions/v1/extract-addon-context`, {
                method: 'POST',
                headers: { 'Authorization': authHeader || '', 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, character_id: characterId, addon_settings: effectiveAddonSettings, mode: 'conversation' })
              });
            }
          } catch (e) {
            console.error('regen.extract.error', e);
          }
        }
      }
    });
  } catch (error) {
    console.error('Regenerate handler error:', error);
    return createStreamingErrorResponse(error instanceof Error ? error.message : 'Internal server error', 'unknown', 'unknown');
  }
}
