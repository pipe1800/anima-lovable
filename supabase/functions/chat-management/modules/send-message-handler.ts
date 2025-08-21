import { createErrorResponse } from '../../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings, anyAddonEnabled, sanitizeAddonSettings } from '../../_shared/settings-mapper.ts';
import type { SendMessageRequest } from '../types/index.ts';
import type { TemplateContext, CurrentContext } from '../types/streaming-interfaces.ts';

// Import from local modules (consolidated)
import { 
  extractCharacterContext
} from './context-extractor.ts';
import { 
  createStreamingErrorResponse,
  processStreamBuffer,
  parseStreamChunk,
  streamAIResponse
} from './streaming.ts';
import { getEnv } from '../../_shared/env.ts';
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
  buildTemplateReplacer
} from './database.ts';
import { assembleConversation } from './conversation-assembler.ts';
import type { ConversationKnobs } from './message-counter.ts';
import { triggerMessageBasedSummary } from './auto-summary-new.ts';
import { generateAIResponse } from './message-handler.ts';
import { logger } from '../../_shared/logger.ts';

// Pre-created encoder (avoid reallocation per request)
const encoder = new TextEncoder();

// Default conversation knobs (immutable)
const DEFAULT_KNOBS: ConversationKnobs = Object.freeze({
  maxPairs: 5,
  historyTokenLimit: 0, // filled dynamically per model (see buildKnobs)
  safetyMarginTokens: 0,
  greedyBaseline: { maxPairs: 10, historyTokenLimit: 0 }
});

function buildKnobs(maxContextTokens: number): ConversationKnobs {
  return {
    ...DEFAULT_KNOBS,
    historyTokenLimit: Math.floor(maxContextTokens * 2 / 3),
    safetyMarginTokens: Math.floor(maxContextTokens * 0.05),
    greedyBaseline: { maxPairs: 10, historyTokenLimit: maxContextTokens }
  };
}

function env(key: string): string | undefined {
  try { return (globalThis as any).Deno?.env?.get(key) ?? (typeof process !== 'undefined' ? (process as any).env?.[key] : undefined); } catch { return undefined; }
}

function redact(id?: string) { if (!id) return 'anon'; return id.length > 8 ? `${id.slice(0,4)}…${id.slice(-2)}` : id; }

interface TimeAwarenessResult {
  enabled: boolean;
  delaySeconds: number;
  userTimezone: string;
  userLocalTime: string;
  conversationTone?: string;
  urgencyLevel?: string;
}

function computeTimeAwareness(userCharacterSettings: any, userProfile: any, messageHistory: any[], currentContext: any): TimeAwarenessResult | undefined {
  if (!userCharacterSettings?.time_awareness_enabled) return undefined;
  const userTimezone = userProfile?.timezone || 'UTC';
  const userLocalTime = new Date().toLocaleString('en-US', { timeZone: userTimezone, hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short', month: 'short', day: 'numeric' });
  // Single pass scan for last AI message (avoid sort)
  let lastAiCreatedAt: number | null = null;
  for (let i = messageHistory.length - 1; i >= 0; i--) {
    const m = messageHistory[i];
    if (m.is_ai_message) { lastAiCreatedAt = new Date(m.created_at).getTime(); break; }
  }
  const delaySeconds = lastAiCreatedAt ? Math.floor((Date.now() - lastAiCreatedAt)/1000) : 0;
  return { enabled: true, delaySeconds, userTimezone, userLocalTime, conversationTone: currentContext?.conversationTone || undefined, urgencyLevel: currentContext?.urgencyLevel || undefined };
}

async function markContextCeilingWarned(supabase: any, chatId: string, truncated: boolean) {
  if (!truncated) return { shouldWarnContextCeiling: false };
  const { data, error } = await supabase
    .from('chats')
    .update({ context_ceiling_warned: true })
    .eq('id', chatId)
    .eq('context_ceiling_warned', false)
    .select('id');
  if (error) {
    logger.warn('contextCeiling.update.error', { chatId, message: error.message });
  }
  return { shouldWarnContextCeiling: Array.isArray(data) && data.length > 0 };
}

async function triggerAddonExtraction(options: { addonsActive: boolean; supabaseUrl?: string; authHeader?: string|null; chatId: string; characterId: string; effectiveAddonSettings: any; message: string; aiResponse: string; messageId: string; }) {
  const { addonsActive, supabaseUrl, authHeader, chatId, characterId, effectiveAddonSettings, message, aiResponse, messageId } = options;
  if (!addonsActive) {
    logger.debug('addons.skip.allDisabled', { chatId });
    return;
  }
  if (!supabaseUrl) {
    logger.warn('addons.skip.missingSupabaseUrl');
    return;
  }
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/extract-addon-context`, {
      method: 'POST',
      headers: { 'Authorization': authHeader || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        character_id: characterId,
        addon_settings: effectiveAddonSettings,
        mode: 'conversation',
        message_id: messageId,
        user_message: message,
        ai_response: aiResponse
      })
    });
    if (!resp.ok) {
      logger.warn('addons.extract.failed', { chatId, status: resp.status });
    } else {
      logger.debug('addons.extract.triggered', { chatId });
    }
  } catch (e) {
    logger.error('addons.extract.error', { chatId, message: (e as Error)?.message });
  }
}

export async function handleSendMessage(
  request: SendMessageRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any,
  req: Request,
  meta?: { requestId?: string }
): Promise<Response> {
  const startTime = Date.now();
  const requestId = meta?.requestId || crypto.randomUUID();
  try {
    const { chatId, message, characterId, selectedPersonaId, selectedWorldInfoId, addonSettings } = request;

    if (!chatId || !message || !characterId) {
      logger.warn('send.validation.missingFields', { requestId, chatId, characterId, hasMessage: !!message });
      return createErrorResponse('Missing required fields', 400);
    }
    if (message.trim().length === 0) {
      return createErrorResponse('Empty message', 400);
    }

    const trivialInput = message.trim().length < 4;
    logger.debug('send.init', { requestId, chatId, characterId, len: message.length, trivial: trivialInput, userId: redact(user?.id) });

    // Parallel fetch
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
      fetchCharacterMemories(user.id, characterId, supabase, { chatId, includeAutoSummaries: true, limitNonAuto: 30, limitAuto: 5 })
    ]);

    const selectedPersona = chatSelectedPersona || (selectedPersonaId ? await fetchSelectedPersona(selectedPersonaId, user.id, supabase) : null);

    const effectiveAddonSettings = sanitizeAddonSettings(globalSettings ? mapGlobalSettingsToAddonSettings(globalSettings) : (addonSettings || {}));
    if (userCharacterSettings?.time_awareness_enabled) effectiveAddonSettings.timeAwareness = true;

    const addonsActive = anyAddonEnabled(effectiveAddonSettings);
    if (trivialInput) {
      if (effectiveAddonSettings.dynamicWorldInfo) effectiveAddonSettings.dynamicWorldInfo = false;
      if (effectiveAddonSettings.enhancedMemory) effectiveAddonSettings.enhancedMemory = false;
      logger.debug('addons.autodisable.trivialInput', { chatId, len: message.trim().length });
    }

    logger.debug('worldInfo.status', { requestId, chatId, requested: !!selectedWorldInfoId, count: worldInfoEntries?.length || 0, dynamic: !!effectiveAddonSettings?.dynamicWorldInfo });

    // Billing
    const creditInfo = calculateCreditCost(planAndModel.plan, effectiveAddonSettings);
    const hasCredits = await consumeCredits(user.id, creditInfo, supabaseAdmin);
    if (!hasCredits) return createErrorResponse(createInsufficientCreditsError(creditInfo), 402);
    logger.info('billing.charge', { requestId, chatId, plan: planAndModel.plan, model: planAndModel.model });

    // Persist user + placeholder messages
    const aiMessageOrder = nextUserMessageOrder + 1;
    const [userMessage, placeholder] = await Promise.all([
      saveUserMessage(supabase, chatId, user.id, message, nextUserMessageOrder),
      createPlaceholderMessage(supabase, chatId, aiMessageOrder)
    ]);
    if (!placeholder) return createErrorResponse('Failed to create placeholder message', 500);

    const templateContext: TemplateContext = { userName: selectedPersona?.name || userProfile?.username || 'User', charName: character.name || 'Character' };
    const currentContext = await fetchCurrentContext(user.id, chatId, characterId, supabase);

    const timeAwarenessData = computeTimeAwareness(userCharacterSettings, userProfile, messageHistory, currentContext);
    if (timeAwarenessData && logger.isTrace()) logger.trace('time.awareness', { requestId, chatId, delaySeconds: timeAwarenessData.delaySeconds, tz: timeAwarenessData.userTimezone });

    const knobs = buildKnobs(planAndModel.maxContextTokens);
    const assembleParams = { character, addonSettings: effectiveAddonSettings, templateContext, currentContext, selectedPersona, replaceTemplatesFn: buildTemplateReplacer(templateContext), supabase, worldInfoEntries, userMessage: message, messageHistory, characterMemories: characterMemories || undefined, chatMode: userCharacterSettings?.chat_mode || 'storytelling', timeAwarenessData, chatId, userId: user.id, maxContextTokens: planAndModel.maxContextTokens, knobs } as const;
    const { conversationResult, promptMeta } = await assembleConversation(assembleParams);
    if (promptMeta && logger.isTrace()) logger.trace('prompt.meta', { requestId, chatId, metaKeys: Object.keys(promptMeta) });

    let conversationMessages = conversationResult.messages;

    // Context ceiling warning optimization
    const { shouldWarnContextCeiling } = await markContextCeilingWarned(supabase, chatId, conversationResult.truncated);

    const openRouterKey = getEnv('OPENROUTER_API_KEY');
    if (!openRouterKey) return createErrorResponse('OpenRouter API key not configured', 500);

    if (conversationResult.needsSummarization) {
      logger.info('summary.trigger', { requestId, chatId, aiCount: conversationResult.currentAiMessageCount, nextAt: conversationResult.nextSummaryAt });
      try {
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
          logger.debug('summary.success', { requestId, chatId, summaryId: summaryResult.summaryId });
          // Rebuild only once using same params (avoid redefining object)
          const rebuilt = await assembleConversation(assembleParams);
          conversationMessages = rebuilt.conversationResult.messages;
          if (rebuilt.promptMeta && logger.isTrace()) logger.trace('prompt.meta.rebuilt', { requestId, chatId, metaKeys: Object.keys(rebuilt.promptMeta) });
        } else {
          logger.warn('summary.failed', { requestId, chatId, error: summaryResult.error });
        }
      } catch (e) {
        logger.error('summary.exception', { requestId, chatId, message: (e as Error)?.message });
      }
    }

    if (logger.isDebug()) {
      logger.debug('openrouter.payload.meta', { requestId, chatId, model: planAndModel.model, messages: conversationMessages.length, systemChars: conversationMessages[0]?.content?.length || 0 });
    }

    const aiResponse = await generateAIResponse(conversationMessages, planAndModel.model, openRouterKey);
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logger.error('openrouter.error', { requestId, chatId, status: aiResponse.status, detail: errorText.slice(0,400) });
      return createStreamingErrorResponse(`Status: ${aiResponse.status} - ${errorText}`, planAndModel.model, planAndModel.plan);
    }

    return streamAIResponse({
      aiResponse,
      async onComplete(finalMessage) {
        if (!finalMessage || !placeholder?.id) return;
        await updateMessageContent(supabaseAdmin, placeholder.id, finalMessage);
        const basicContext: CurrentContext = { moodTracking: 'No context', clothingInventory: 'No context', locationTracking: 'No context', timeAndWeather: 'No context', relationshipStatus: 'No context', characterPosition: 'No context' };
        await saveCharacterMessage(supabase, supabaseAdmin, user.id, chatId, finalMessage, basicContext, placeholder.id, aiMessageOrder);
        await updateChatLastActivity(supabase, chatId, characterId);
        await triggerAddonExtraction({ addonsActive, supabaseUrl: getEnv('SUPABASE_URL', { required: false }), authHeader: req.headers.get('authorization'), chatId, characterId, effectiveAddonSettings, message, aiResponse: finalMessage, messageId: placeholder.id });
        logger.info('stream.complete', { requestId, chatId, ms: Date.now() - startTime });
      },
      onError(err) {
        logger.error('stream.error', { requestId, chatId, message: (err as Error)?.message });
      }
    });
  } catch (error) {
    logger.error('sendMessage.error', { requestId, chatId: request.chatId, message: (error as Error)?.message });
    return createStreamingErrorResponse(error instanceof Error ? error.message : 'Internal server error', 'unknown', 'unknown');
  }
}
