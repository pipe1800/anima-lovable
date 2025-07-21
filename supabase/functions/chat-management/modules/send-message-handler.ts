import { createErrorResponse } from '../../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings } from '../../_shared/settings-mapper.ts';

// Import from local modules (consolidated)
import { 
  extractCharacterContext, 
  extractContextFromResponse, 
  saveContextUpdates 
} from './context-extractor.ts';
import { 
  createStreamingErrorResponse,
  processStreamBuffer,
  parseStreamChunk
} from './streaming.ts';
import { 
  getUserPlanAndModel, 
  calculateCreditCost, 
  consumeCredits, 
  createInsufficientCreditsError 
} from './billing.ts';
import {
  fetchCharacterData,
  fetchConversationHistory,
  fetchUserProfile,
  fetchUserGlobalSettings,
  fetchUserSelectedWorldInfo,
  fetchSelectedPersona,
  fetchChatSelectedPersona,
  fetchCurrentContext,
  fetchCharacterMemories,
  getNextMessageOrder,
  saveUserMessage,
  createPlaceholderMessage,
  updateMessageContent,
  saveCharacterMessage,
  updateChatLastActivity,
  replaceTemplates
} from './database.ts';
import {
  buildSystemPrompt,
  buildConversationMessages,
  generateAIResponse
} from './message-handler.ts';

import type { SendMessageRequest } from '../types/index.ts';
import type { 
  TemplateContext, 
  CurrentContext 
} from '../types/streaming-interfaces.ts';

/**
 * Send Message Handler - Streaming AI Responses
 * 
 * This handler reuses the exact same logic as chat-stream but integrates
 * it into the unified chat-management function.
 */

export async function handleSendMessage(
  request: SendMessageRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any,
  req: Request
): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const { chatId, message, characterId, selectedPersonaId, selectedWorldInfoId, addonSettings } = request;

    if (!chatId || !message || !characterId) {
      console.error('❌ Missing required fields:', { chatId: !!chatId, message: !!message, characterId: !!characterId });
      return createErrorResponse('Missing required fields', 400);
    }

    console.log('✅ Required fields validated:', { 
      chatId, 
      characterId, 
      messageLength: message.length,
      hasSelectedWorldInfo: !!selectedWorldInfoId,
      selectedWorldInfoId: selectedWorldInfoId || 'none',
      selectedWorldInfoIdType: typeof selectedWorldInfoId,
      addonSettings: addonSettings || 'none provided'
    });

    // ============================================================================
    // DATABASE OPERATIONS - PARALLEL FETCHING (same as chat-stream)
    // ============================================================================
    console.log('📊 Fetching required data...');
    
    const [
      character,
      messageHistory,
      userProfile,
      globalSettings,
      chatSelectedPersona,
      planAndModel,
      nextUserMessageOrder,
      worldInfoEntries,
      characterMemories
    ] = await Promise.all([
      fetchCharacterData(characterId, supabaseAdmin),
      fetchConversationHistory(chatId, supabase),
      fetchUserProfile(user.id, supabase),
      fetchUserGlobalSettings(user.id, supabaseAdmin),
      fetchChatSelectedPersona(chatId, user.id, supabase),
      getUserPlanAndModel(user.id, supabaseAdmin),
      getNextMessageOrder(chatId, supabase),
      fetchUserSelectedWorldInfo(user.id, characterId, selectedWorldInfoId || null, supabase),
      fetchCharacterMemories(user.id, characterId, supabase)
    ]);

    // Use chat's selected persona, or fallback to request persona, or fallback to null
    const selectedPersona = chatSelectedPersona || 
      (selectedPersonaId ? await fetchSelectedPersona(selectedPersonaId, user.id, supabase) : null);

    // Convert global settings to addon settings for backward compatibility
    const effectiveAddonSettings = globalSettings ? mapGlobalSettingsToAddonSettings(globalSettings) : (addonSettings || {});

    console.log('🌍 World Info Status:', {
      requested: !!selectedWorldInfoId,
      fetched: !!worldInfoEntries,
      entriesCount: worldInfoEntries?.length || 0,
      dynamicWorldInfoEnabled: effectiveAddonSettings?.dynamicWorldInfo || false,
      globalSettings: globalSettings ? 'loaded' : 'not loaded',
      effectiveAddonSettings: effectiveAddonSettings,
      worldInfoEntries: worldInfoEntries
    });

    // ============================================================================
    // BILLING & CREDIT MANAGEMENT (same as chat-stream)
    // ============================================================================
    const creditInfo = calculateCreditCost(planAndModel.plan, effectiveAddonSettings);
    const hasCredits = await consumeCredits(user.id, creditInfo, supabaseAdmin);
    
    if (!hasCredits) {
      return createErrorResponse(createInsufficientCreditsError(creditInfo), 402);
    }

    // ============================================================================
    // SAVE USER MESSAGE & CREATE AI PLACEHOLDER (same as chat-stream)
    // ============================================================================
    const aiMessageOrder = nextUserMessageOrder + 1;
    
    const [userMessage, placeholder] = await Promise.all([
      saveUserMessage(supabase, chatId, user.id, message, nextUserMessageOrder),
      createPlaceholderMessage(supabase, chatId, aiMessageOrder)
    ]);

    if (!placeholder) {
      return createErrorResponse('Failed to create placeholder message', 500);
    }

    // ============================================================================
    // TEMPLATE CONTEXT & CURRENT CONTEXT SETUP (same as chat-stream)
    // ============================================================================
    const templateContext: TemplateContext = {
      userName: selectedPersona?.name || userProfile?.username || 'User',
      charName: character.personality_summary?.split(' ')[0] || 'Character'
    };

    const currentContext = await fetchCurrentContext(user.id, chatId, characterId, supabase);

    // ============================================================================
    // BUILD SYSTEM PROMPT & CONVERSATION (same as chat-stream)
    // ============================================================================
    const systemPrompt = buildSystemPrompt(
      character,
      effectiveAddonSettings,
      templateContext,
      currentContext,
      selectedPersona,
      (content) => replaceTemplates(content, templateContext),
      worldInfoEntries,
      message,
      messageHistory,
      characterMemories
    );

    const conversationMessages = buildConversationMessages(systemPrompt, messageHistory, message);

    // ============================================================================
    // AI RESPONSE GENERATION & STREAMING (adapted from chat-stream)
    // ============================================================================
    // Get OpenRouter API key (handle both Deno and Node environments)
    const openRouterKey = (() => {
      try {
        return globalThis.Deno?.env?.get('OPENROUTER_API_KEY');
      } catch {
        return process?.env?.OPENROUTER_API_KEY;
      }
    })();
    if (!openRouterKey) {
      return createErrorResponse('OpenRouter API key not configured', 500);
    }

    const aiResponse = await generateAIResponse(conversationMessages, planAndModel.model, openRouterKey);

    // Enhanced error handling for AI API
    if (!aiResponse.ok) {
      console.error('❌ OpenRouter API Error Status:', aiResponse.status);
      return createStreamingErrorResponse(
        `Status: ${aiResponse.status}`,
        planAndModel.model,
        planAndModel.plan
      );
    }

    // ============================================================================
    // STREAMING RESPONSE (copied exactly from chat-stream)
    // ============================================================================
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

            // Decode chunk and add to buffer
            buffer += new TextDecoder().decode(value, { stream: true });

            // Process complete lines from buffer
            const { lines, remainingBuffer } = processStreamBuffer(buffer);
            buffer = remainingBuffer;

            for (const line of lines) {
              if (!line.trim()) continue;

              const { content, isDone } = parseStreamChunk(line);

              if (isDone) {
                // Save final message immediately for instant UI feedback
                const finalMessage = fullResponse.trim();
                if (finalMessage && placeholder?.id) {
                  console.log('💾 Saving final message...');

                  // Update placeholder content first
                  await updateMessageContent(supabaseAdmin, placeholder.id, finalMessage);

                  // Convert placeholder to real message
                  const basicContext: CurrentContext = {
                    moodTracking: 'No context',
                    clothingInventory: 'No context',
                    locationTracking: 'No context',
                    timeAndWeather: 'No context',
                    relationshipStatus: 'No context',
                    characterPosition: 'No context'
                  };

                  await saveCharacterMessage(
                    supabase,
                    supabaseAdmin,
                    user.id,
                    chatId,
                    finalMessage,
                    basicContext,
                    placeholder.id,
                    aiMessageOrder
                  );

                  await updateChatLastActivity(supabase, chatId, characterId);

                  // Background context extraction (non-blocking)
                  if (effectiveAddonSettings && Object.values(effectiveAddonSettings).some(Boolean)) {
                    extractContextFromResponse(
                      character,
                      messageHistory,
                      message,
                      finalMessage,
                      effectiveAddonSettings,
                      openRouterKey,
                      (content) => replaceTemplates(content, templateContext),
                      supabase,
                      user.id,
                      chatId,
                      characterId
                    ).catch(error => {
                      console.error('Background context extraction error:', error);
                    });
                  }

                  console.log(`✅ Message streaming completed in ${Date.now() - startTime}ms`);
                }
                break;
              }

              if (content) {
                fullResponse += content;
                // Stream the content to client
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            }
          }

          // Send completion signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();

        } catch (streamError) {
          console.error('💥 Streaming error:', streamError);
          controller.error(streamError);
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
    console.error('💥 Error in handleSendMessage:', error);
    return createStreamingErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      'unknown',
      'unknown'
    );
  }
}
