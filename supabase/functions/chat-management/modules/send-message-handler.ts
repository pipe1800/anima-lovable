import { createErrorResponse } from '../../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings, anyAddonEnabled, sanitizeAddonSettings } from '../../_shared/settings-mapper.ts';
import type { SendMessageRequest } from '../types/index.ts';
import type { TemplateContext, CurrentContext } from '../types/streaming-interfaces.ts';

// Import from local modules (consolidated)
// (extractCharacterContext removed: not used here after consolidation)
import { 
  createStreamingErrorResponse,
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
  fetchCharacterData, // kept for potential fallback minimal fetch (already minimal when full:false)
  fetchConversationHistory,
  fetchUserGlobalSettings,
  fetchUserCharacterSettings,
  fetchUserSelectedWorldInfo,
  fetchCurrentContext, // fallback only
  fetchCharacterMemories, // supplemental memories when bootstrap omitted or disabled
  fetchChatBootstrapSnapshot, // new consolidated bootstrap accessor
  saveUserMessage,
  saveCharacterMessage,
  updateChatLastActivity,
  buildTemplateReplacer
} from './database.ts';
// Removed getUserPersonaProfile direct usage (now via bootstrap snapshot)
import { assembleConversation } from './conversation-assembler.ts';
import type { ConversationKnobs } from './message-counter.ts';
// (triggerMessageBasedSummary removed here – summaries handled elsewhere post message)
import { generateAIResponse } from './message-handler.ts';
import { logger } from '../../_shared/logger.ts';
// Centralized relationship progression helpers
import { processRelationshipLifecycle, postStreamDetectIssuedInvitation } from './relationship-progression.ts';

// (encoder constant removed – not used after refactors)

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

// REL_ADV: Helper to persist relationship & metadata into chat_context only when changed
// Removed obsolete persistRelationshipContext and broadcastRelationshipContext stubs (centralized module handles relationship persistence now)

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

async function triggerAddonExtraction(options: { addonsActive: boolean; supabaseUrl?: string; authHeader?: string|null; chatId: string; characterId: string; effectiveAddonSettings: any; message: string; aiResponse: string; messageId: string; characterGreeting?: string | null }) {
  const { addonsActive, supabaseUrl, authHeader, chatId, characterId, effectiveAddonSettings, message, aiResponse, messageId, characterGreeting } = options;
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
        ai_response: aiResponse,
        character_greeting: characterGreeting || undefined
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

    // Feature flag: include curated memories in bootstrap (manual summaries only) if enabled & not trivial
    const includeBootstrapMemories = !trivialInput && (env('BOOTSTRAP_INCLUDE_MEMORIES') === 'true');

    // Consolidated bootstrap snapshot (persona/profile/character/context/relationship/latest_ai/memories*)
    const bootstrap = await fetchChatBootstrapSnapshot({
      supabase,
      userId: user.id,
      chatId,
      characterId,
      includeMemories: includeBootstrapMemories,
      memoryLimit: 20
    });

    // Independent parallel fetches still required (not part of snapshot): history, settings, plan/model, world info, user-character settings
    const [
      messageHistory,
      globalSettings,
      userCharacterSettings,
      planAndModel,
      worldInfoEntries
    ] = await Promise.all([
      fetchConversationHistory(chatId, supabase),
      fetchUserGlobalSettings(user.id, supabaseAdmin),
      fetchUserCharacterSettings(user.id, characterId, supabaseAdmin),
      getUserPlanAndModel(user.id, supabaseAdmin),
      fetchUserSelectedWorldInfo(user.id, characterId, selectedWorldInfoId || null, supabase)
    ]);

    // Fallback logic: if bootstrap failed (character null) fetch minimal character directly
    const character = bootstrap.character || await fetchCharacterData(characterId, supabaseAdmin, { full: false });
    const userProfile = bootstrap.profile || { username: user?.email || 'User' };
    const selectedPersona = bootstrap.persona || null;
    let currentContext: any = bootstrap.context || {};

    // Supplemental memories logic:
    // If bootstrap memories disabled OR flag off -> fetch full memory strategy (manual + limited auto) like before
    let characterMemories = bootstrap.memories as any[] | null;
    if (!includeBootstrapMemories) {
      characterMemories = await fetchCharacterMemories(user.id, characterId, supabase, { chatId, includeAutoSummaries: !trivialInput, limitNonAuto: 30, limitAuto: 5 });
    } else if (includeBootstrapMemories && !trivialInput) {
      // Optionally append a small set of auto summaries (not included in bootstrap RPC) for richer context
      try {
        const autoSubset = await fetchCharacterMemories(user.id, characterId, supabase, { chatId, includeAutoSummaries: true, limitNonAuto: 0, limitAuto: 5 });
        if (Array.isArray(autoSubset) && autoSubset.length) {
          const manual = Array.isArray(characterMemories) ? characterMemories : [];
          // Filter to only auto summaries from the subset fetch
          const autoOnly = autoSubset.filter(m => m.is_auto_summary);
            // Deduplicate by id
          const seen = new Set<string>();
          const combined = [...manual, ...autoOnly].filter(m => { const k = m.id; if (seen.has(k)) return false; seen.add(k); return true; });
          characterMemories = combined;
        }
      } catch (e) {
        logger.warn('bootstrap.autoSummaries.append.error', { requestId, chatId, message: (e as Error)?.message });
      }
    }

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
    const hasCredits = await consumeCredits(user.id, creditInfo, supabase, supabaseAdmin);
    if (!hasCredits) return createErrorResponse(createInsufficientCreditsError(creditInfo), 402);
    logger.info('billing.charge', { requestId, chatId, plan: planAndModel.plan, model: planAndModel.model });

    // Persist user message only
    // Derive next message order locally (avoid extra DB round trip)
    let lastOrder = 0;
    if (Array.isArray(messageHistory) && messageHistory.length) {
      const last = messageHistory[messageHistory.length - 1];
      if (typeof last?.message_order === 'number') lastOrder = last.message_order;
    }
    const nextUserMessageOrder = lastOrder + 1;
    const aiMessageOrder = nextUserMessageOrder + 1;
    const userMessage = await saveUserMessage(supabase, chatId, user.id, message, nextUserMessageOrder);

    const templateContext: TemplateContext = { userName: selectedPersona?.name || userProfile?.username || 'User', charName: character?.name || 'Character' };
    // currentContext already from bootstrap; fallback to legacy fetch if empty object and we expect some context keys
    if (!currentContext || Object.keys(currentContext).length === 0) {
      try {
        const legacyCtx = await fetchCurrentContext(user.id, chatId, characterId, supabase);
        if (legacyCtx && Object.keys(legacyCtx).length) {
          currentContext = legacyCtx;
        }
      } catch (e) {
        logger.warn('context.fallback.fetch.error', { requestId, chatId, message: (e as Error)?.message });
      }
    }

    // Centralized relationship lifecycle processing (replaces previous inline blocks)
    const relLifecycle = await processRelationshipLifecycle({
      supabase,
      supabaseAdmin,
      user,
      chatId,
      characterId,
      message,
      messageHistory,
      currentContext,
      requestId,
      // Provide bootstrap snapshot relationship for potential short-circuit if module supports it
      bootstrapRelationship: bootstrap.relationship || null
    } as any);
    let relationshipProgress = relLifecycle.relationshipProgress;
    currentContext = relLifecycle.currentContext;
    if (relationshipProgress) {
      try { (currentContext as any)._relationshipProgress = { ...relationshipProgress }; } catch {}
    }

    // Time awareness: adjust message for AI
    if (userCharacterSettings?.time_awareness_enabled && effectiveAddonSettings.timeAwareness) {
      const timeResult = computeTimeAwareness(userCharacterSettings, userProfile, messageHistory, currentContext);
      if (timeResult) {
        logger.info('timeAwareness.computed', { requestId, chatId, delaySeconds: timeResult.delaySeconds, userTimezone: timeResult.userTimezone, userLocalTime: timeResult.userLocalTime });
        (currentContext as any)._timeAwareness = timeResult;
      }
    }

    // Assemble final conversation for AI using local assembler
    const assemblyStart = Date.now();
    const { systemPrompt, conversationResult, promptMeta } = await assembleConversation({
      character,
      addonSettings: effectiveAddonSettings,
      templateContext,
      currentContext,
      selectedPersona,
      replaceTemplatesFn: buildTemplateReplacer(templateContext),
      supabase,
      worldInfoEntries,
      userMessage: message,
      messageHistory,
      characterMemories: characterMemories || undefined,
      chatMode: userCharacterSettings?.chat_mode || 'storytelling',
      timeAwarenessData: (currentContext as any)._timeAwareness,
      chatId,
      userId: user.id,
      maxContextTokens: planAndModel.maxContextTokens,
      knobs: buildKnobs(planAndModel.maxContextTokens)
    });
    logger.info('conversation.assemble.success', { requestId, chatId, duration: Date.now() - assemblyStart });

    const conversationMessages = conversationResult.messages;

    const openRouterKey = getEnv('OPENROUTER_API_KEY');
    if (!openRouterKey) return createErrorResponse('OpenRouter API key not configured', 500);

    const aiResponse = await generateAIResponse(conversationMessages, planAndModel.model, openRouterKey);
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logger.error('openrouter.error', { requestId, chatId, status: aiResponse.status, detail: errorText.slice(0,400) });
      return createStreamingErrorResponse(`Status: ${aiResponse.status} - ${errorText}`, planAndModel.model, planAndModel.plan);
    }

    const streamStart = Date.now();
    const streamResp = streamAIResponse({
      aiResponse,
      async onChunk() {},
      async onComplete(full) {
        logger.info('streamAIResponse.complete', { requestId, chatId, duration: Date.now() - streamStart });
        try {
          // Centralized post-stream invitation detection (replaces inline detection)
          await postStreamDetectIssuedInvitation({
            supabaseAdmin,
            userId: user.id,
            characterId,
            chatId,
            full,
            relationshipProgress,
            requestId
          });
          // Save final AI message after streaming completes
          const finalMessage = await saveCharacterMessage(
            supabaseAdmin,
            user.id,
            characterId,
            chatId,
            full,
            currentContext || {},
            aiMessageOrder
          );
          logger.info('Message saved after streaming', {
            requestId,
            chatId,
            messageId: finalMessage.id
          });
        } catch (e) {
          logger.error('aiMessage.insert.error', { requestId, chatId, message: (e as Error)?.message });
        }
        await updateChatLastActivity(supabase, chatId, characterId);
        await Promise.all([
          markContextCeilingWarned(supabase, chatId, false),
          triggerAddonExtraction({ addonsActive, supabaseUrl: env('SUPABASE_URL'), authHeader: req.headers.get('Authorization'), chatId, characterId, effectiveAddonSettings, message, aiResponse: full, messageId: 'final', characterGreeting: character?.greeting || null })
        ]);
      },
      onError: (e) => {
        logger.error('streamAIResponse.error', { requestId, chatId, message: (e as Error)?.message });
      }
    });
    return streamResp; // return streaming SSE response directly
  } catch (e) {
    logger.error('sendMessage.handler.error', { requestId, message: (e as Error)?.message });
    return createErrorResponse('Internal server error', 500);
  } finally {
    logger.info('sendMessage.handler.complete', { requestId, duration: Date.now() - startTime });
  }
}
