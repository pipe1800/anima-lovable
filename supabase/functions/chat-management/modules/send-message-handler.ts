import { createErrorResponse } from '../../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings } from '../../_shared/settings-mapper.ts';

// Import from local modules (consolidated)
import { 
  extractCharacterContext
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
  fetchUserCharacterSettings,
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
import { buildConversationMessagesWithMessageBudget } from './message-counter.ts';
import { triggerMessageBasedSummary, getMostRecentAutoSummary } from './auto-summary-new.ts';

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
      userCharacterSettings,
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
      fetchUserCharacterSettings(user.id, characterId, supabaseAdmin),
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
    
    // Add time awareness from user character settings
    if (userCharacterSettings?.time_awareness_enabled) {
      effectiveAddonSettings.timeAwareness = true;
    }

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
    // TIME AWARENESS CALCULATION
    // ============================================================================
    let timeAwarenessData: {
      enabled: boolean;
      delaySeconds: number;
      userTimezone: string;
      userLocalTime: string;
      conversationTone?: string;
      urgencyLevel?: string;
    } | undefined = undefined;
    
    if (userCharacterSettings?.time_awareness_enabled) {
      // Always provide timezone and current time when time awareness is enabled
      const userTimezone = userProfile?.timezone || 'UTC';
      console.log('🐛 TIME AWARENESS DEBUG - userProfile:', {
        userProfile,
        timezone: userProfile?.timezone,
        userTimezone,
        profileExists: !!userProfile
      });
      
      const userLocalTime = new Date().toLocaleString('en-US', { 
        timeZone: userTimezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      
      // Get the last AI message timestamp for delay calculation
      const lastAiMessage = messageHistory
        .filter(msg => msg.is_ai_message)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      let delaySeconds = 0;
      let hasDelay = false;

      if (lastAiMessage) {
        const currentTime = new Date();
        const lastMessageTime = new Date(lastAiMessage.created_at);
        delaySeconds = Math.floor((currentTime.getTime() - lastMessageTime.getTime()) / 1000);
        hasDelay = delaySeconds > 30;
        console.log('🐛 TIMEZONE DEBUG:', {
          userTimezoneFromProfile: userProfile?.timezone,
          fallbackUserTimezone: userTimezone,
          profileExists: !!userProfile,
          delaySeconds,
          hasDelay
        });
        
        // Always create timeAwarenessData when time awareness is enabled
        timeAwarenessData = {
          enabled: true,
          delaySeconds,
          userTimezone,
          userLocalTime,
          conversationTone: (currentContext as any)?.conversationTone || undefined,
          urgencyLevel: (currentContext as any)?.urgencyLevel || undefined
        };

        console.log('⏰ Time awareness activated:', {
          delaySeconds,
          formattedDelay: delaySeconds < 60 ? `${delaySeconds}s` : 
                        delaySeconds < 3600 ? `${Math.floor(delaySeconds/60)}m` : 
                        `${Math.floor(delaySeconds/3600)}h`,
          userLocalTime,
          userTimezone,
          hasDelay,
          conversationTone: timeAwarenessData.conversationTone,
          urgencyLevel: timeAwarenessData.urgencyLevel
        });
      }
    }

    // ============================================================================
    // BUILD SYSTEM PROMPT & CONVERSATION (same as chat-stream)
    // ============================================================================
        const systemPrompt = await buildSystemPrompt(
      character,
      effectiveAddonSettings,
      templateContext,
      currentContext,
      selectedPersona,
      (content) => replaceTemplates(content, templateContext),
      supabase,
      worldInfoEntries,
      message,
      messageHistory,
      characterMemories,
      userCharacterSettings?.chat_mode || 'storytelling',
      timeAwarenessData
    );

    // Use new message-based budget management
    const conversationResult = await buildConversationMessagesWithMessageBudget(
      systemPrompt,
      messageHistory,
      message,
      planAndModel.maxContextTokens,
      chatId,
      supabase
    );

    let conversationMessages = conversationResult.messages;

    // Check if we should warn about context ceiling
    let shouldWarnContextCeiling = false;
    if (conversationResult.truncated) {
      // Check if we've already warned for this chat
      const { data: chatData } = await supabase
        .from('chats')
        .select('context_ceiling_warned')
        .eq('id', chatId)
        .single();

      if (!chatData?.context_ceiling_warned) {
        shouldWarnContextCeiling = true;
        
        // Update chat to mark warning as shown
        await supabase
          .from('chats')
          .update({ context_ceiling_warned: true })
          .eq('id', chatId);
      }
    }

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

    // Check if we need to trigger a background summary
    if (conversationResult.needsSummarization) {
      console.log('🚨 AUTO-SUMMARY TRIGGERED! 15 AI responses reached, triggering synchronous summarization...');
      console.log('📊 Summary trigger details:', {
        currentAiMessageCount: conversationResult.currentAiMessageCount,
        nextSummaryAt: conversationResult.nextSummaryAt,
        chatId: chatId,
        characterId: characterId,
        messagesToSummarizeCount: conversationResult.messagesToSummarize.length
      });
      
      // CRITICAL FIX: Wait for summary to complete before continuing with AI response
      try {
        console.log('⏳ Waiting for summary completion before generating AI response...');
        const summaryResult = await triggerMessageBasedSummary(
          chatId,
          user.id,
          characterId,
          conversationResult.messagesToSummarize,
          character,
          openRouterKey,
          supabaseAdmin
        );
        
        if (summaryResult.success) {
          console.log(`✅ Summary completed successfully: ${summaryResult.summaryId} (${summaryResult.messageRange})`);
          console.log('🔄 Rebuilding conversation context with new summary...');
          
          // IMPORTANT: Rebuild the conversation context after summary is saved
          // This ensures the next AI response uses the summary instead of raw messages
          const updatedConversationResult = await buildConversationMessagesWithMessageBudget(
            systemPrompt,
            messageHistory,
            message,
            planAndModel.maxContextTokens,
            chatId,
            supabaseAdmin
          );
          
          // Update the conversation messages to use the new context with summary
          conversationMessages = updatedConversationResult.messages;
          console.log('✅ Context rebuilt with summary, new message count:', conversationMessages.length);
          console.log('📊 Updated token usage:', updatedConversationResult.totalTokens);
        } else {
          console.error(`❌ Summary failed: ${summaryResult.error}. Continuing with current context.`);
          // Continue with existing context if summary fails
        }
      } catch (error) {
        console.error('⚠️ Summary generation failed, continuing with current context:', error);
        // Continue with existing context if summary fails
      }
    } else {
      console.log('📝 No auto-summary needed:', {
        currentAiMessageCount: conversationResult.currentAiMessageCount,
        nextSummaryAt: conversationResult.nextSummaryAt,
        needsSummarization: conversationResult.needsSummarization
      });
    }

    const aiResponse = await generateAIResponse(conversationMessages, planAndModel.model, openRouterKey);

    // Enhanced error handling for AI API
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('❌ OpenRouter API Error Status:', aiResponse.status);
      console.error('❌ OpenRouter Error Details:', errorText);
      console.error('❌ Request payload was:', JSON.stringify({
        model: planAndModel.model,
        messagesCount: conversationMessages.length,
        messages: conversationMessages.map(m => ({ role: m.role, contentLength: m.content.length }))
      }, null, 2));
      
      return createStreamingErrorResponse(
        `Status: ${aiResponse.status} - ${errorText}`,
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

                  // Trigger addon context extraction after message is saved
                  console.log('🔍 Triggering addon context extraction...');
                  try {
                    const supabaseUrl = (() => {
                      try {
                        return globalThis.Deno?.env?.get('SUPABASE_URL');
                      } catch {
                        return process?.env?.SUPABASE_URL;
                      }
                    })();
                    
                    // Get the Authorization header from the original request
                    const authHeader = req.headers.get('authorization');
                    
                    const extractResponse = await fetch(`${supabaseUrl}/functions/v1/extract-addon-context`, {
                      method: 'POST',
                      headers: {
                        'Authorization': authHeader || '',
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        chat_id: chatId,
                        character_id: characterId,
                        addon_settings: effectiveAddonSettings,
                        mode: 'conversation'
                      })
                    });
                    
                    if (extractResponse.ok) {
                      console.log('✅ Addon context extraction triggered successfully');
                    } else {
                      console.error('❌ Failed to trigger addon context extraction:', extractResponse.status);
                    }
                  } catch (extractError) {
                    console.error('💥 Error triggering addon context extraction:', extractError);
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

          // Send completion signal with metadata
          const completionData: any = { done: true };
          
          // Add context ceiling warning if needed
          if (shouldWarnContextCeiling) {
            completionData.metadata = {
              contextCeilingReached: true,
              droppedMessages: conversationResult.droppedMessages,
              tokenUsage: {
                total: conversationResult.totalTokens,
                max: planAndModel.maxContextTokens,
                percentUsed: Math.round((conversationResult.totalTokens / planAndModel.maxContextTokens) * 100)
              }
            };
          }

          // Add auto-summary trigger info if needed
          if (conversationResult.needsSummarization) {
            completionData.metadata = {
              ...completionData.metadata,
              autoSummaryTriggered: true
            };
          }
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`));
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
