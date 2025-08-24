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

// REL_ADV: Helper to persist relationship & metadata into chat_context only when changed
async function persistRelationshipContext(options: {
  supabaseAdmin: any;
  userId: string;
  chatId: string;
  characterId: string;
  currentContext: any; // existing context (object)
  relationship: string;
  meta: any; // jsonb-safe plain object
  requestId: string;
}) {
  const { supabaseAdmin, userId, chatId, characterId, currentContext, relationship, meta, requestId } = options;
  try {
    const existingRel = currentContext?.relationship;
    const existingMeta = currentContext?.relationship_meta;
    const metaChanged = JSON.stringify(existingMeta || null) !== JSON.stringify(meta || null);
    if (existingRel === relationship && !metaChanged) return false; // no-op
    const merged = { ...(currentContext || {}), relationship, relationship_meta: meta };
    await supabaseAdmin.from('chat_context').upsert({
      chat_id: chatId,
      user_id: userId,
      character_id: characterId,
      current_context: merged
    }, { onConflict: 'chat_id' });
    logger.debug('relationship.context.persisted', { requestId, chatId, changed: true });
    return true;
  } catch (e) {
    logger.warn('relationship.context.persist.error', { requestId, chatId, message: (e as Error)?.message });
    return false;
  }
}

// REL_ADV: Broadcast updated canonical relationship line to ALL chats for this user-character (when goals template active)
async function broadcastRelationshipContext(options: {
  supabaseAdmin: any;
  userId: string;
  characterId: string;
  relationship: string;
  meta: any;
  requestId: string;
  excludeChatId?: string;
}) {
  const { supabaseAdmin, userId, characterId, relationship, meta, requestId, excludeChatId } = options;
  try {
    const { data: chats, error } = await supabaseAdmin
      .from('chats')
      .select('id')
      .eq('user_id', userId)
      .eq('character_id', characterId);
    if (error) {
      logger.warn('relationship.broadcast.fetchChats.error', { requestId, characterId, msg: error.message });
      return;
    }
    if (!Array.isArray(chats) || chats.length === 0) return;
    const metaJson = meta; // ensure plain object
    for (const row of chats) {
      const cid = row.id;
      if (!cid || cid === excludeChatId) continue; // current chat already updated separately
      try {
        // Fetch existing context to merge (avoid overwriting unrelated fields)
        const { data: ctxRow } = await supabaseAdmin
          .from('chat_context')
          .select('current_context')
          .eq('chat_id', cid)
          .maybeSingle();
        const baseCtx = (ctxRow?.current_context && typeof ctxRow.current_context === 'object') ? ctxRow.current_context : {};
        // Skip if identical already
        if (baseCtx.relationship === relationship && JSON.stringify(baseCtx.relationship_meta||null) === JSON.stringify(metaJson||null)) continue;
        const mergedCtx = { ...baseCtx, relationship, relationship_meta: metaJson };
        await supabaseAdmin.from('chat_context').upsert({
          chat_id: cid,
            user_id: userId,
            character_id: characterId,
            current_context: mergedCtx
        }, { onConflict: 'chat_id' });
      } catch (e) {
        logger.warn('relationship.broadcast.single.error', { requestId, characterId, chatId: cid, message: (e as Error)?.message });
      }
    }
    logger.debug('relationship.broadcast.completed', { requestId, characterId, total: chats.length });
  } catch (e) {
    logger.warn('relationship.broadcast.exception', { requestId, characterId, message: (e as Error)?.message });
  }
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
    const hasCredits = await consumeCredits(user.id, creditInfo, supabase, supabaseAdmin);
    if (!hasCredits) return createErrorResponse(createInsufficientCreditsError(creditInfo), 402);
    logger.info('billing.charge', { requestId, chatId, plan: planAndModel.plan, model: planAndModel.model });

    // Persist user message only
    const aiMessageOrder = nextUserMessageOrder + 1;
    const userMessage = await saveUserMessage(supabase, chatId, user.id, message, nextUserMessageOrder);

    const templateContext: TemplateContext = { userName: selectedPersona?.name || userProfile?.username || 'User', charName: character.name || 'Character' };
    let currentContext = await fetchCurrentContext(user.id, chatId, characterId, supabase);

    // REL_ADV: Fetch current relationship progress state directly first (avoid costly evaluation each message)
    let relationshipProgress: any = null;
    try {
      const { data: rawStateRow, error: rawStateErr } = await supabaseAdmin
        .from('user_character_relationship_progress')
        .select('state')
        .eq('user_id', user.id)
        .eq('character_id', characterId)
        .maybeSingle();
      if (rawStateErr) {
        logger.warn('relationship.state.fetch.error', { requestId, chatId, msg: rawStateErr.message });
      } else if (rawStateRow?.state) {
        relationshipProgress = rawStateRow.state; // state column is jsonb
      }
    } catch (e) {
      logger.warn('relationship.state.fetch.exception', { requestId, chatId, message: (e as Error)?.message });
    }

    // REL_ADV: Decide whether to re-evaluate progress. We only evaluate when:
    //  - No prior state row exists
    //  - last_eval_at older than 60s (decay / score accumulation window)
    //  - ready_for_next is true (we keep confirming it remains) OR pending_regression present
    //  - explicit advancement just occurred later (handled separately below) / skipped stage
    let performedEvaluation = false;
    try {
      const lastEvalAt = relationshipProgress?.last_eval_at ? new Date(relationshipProgress.last_eval_at).getTime() : 0;
      const ageMs = Date.now() - lastEvalAt;
      const needsEval = !relationshipProgress || ageMs > 60_000 || relationshipProgress.ready_for_next || relationshipProgress.pending_regression;
      if (needsEval) {
        const { data: evalState, error: evalErr } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
        if (evalErr) {
          logger.warn('relationship.eval.error', { requestId, chatId, msg: evalErr.message, ageMs, hadState: !!relationshipProgress });
        } else {
          relationshipProgress = evalState;
          performedEvaluation = true;
          logger.debug('relationship.eval.performed', { requestId, chatId, ageMs, ready: !!relationshipProgress?.ready_for_next });
        }
      } else {
        logger.debug('relationship.eval.skipped', { requestId, chatId, ageMs, ready: !!relationshipProgress?.ready_for_next });
      }
    } catch (e) {
      logger.warn('relationship.eval.exception', { requestId, chatId, message: (e as Error)?.message });
    }

    // RETRO DETECTION: detect past invitation & update context immediately
    try {
      if (relationshipProgress && relationshipProgress.ready_for_next && relationshipProgress.invitation_status === 'ready_unasked') {
        const lastAiMsg = (messageHistory||[]).slice().reverse().find((m:any)=> m && m.is_ai_message)?.content || '';
        if (lastAiMsg) {
          const inviteRegexes = [
            /\bwould you (?:like|want) to (?:be|become|move into)\b/i,
            /\bshall we (?:become|move into)\b/i,
            /\bdo you want to (?:be|become|enter)\b/i,
            /\bmake (?:us|this) official\b/i,
            /\bmove into the next stage\b/i
          ];
          if (inviteRegexes.some(r=> r.test(lastAiMsg))) {
            const { error: retroErr } = await supabaseAdmin.rpc('set_relationship_invitation_status', { p_user_id: user.id, p_character_id: characterId, p_action: 'asked' });
            if (!retroErr) {
              relationshipProgress.invitation_status = 'asked_pending';
              // Refresh and persist updated relationship line so next prompt reflects asked_pending
              try {
                const { data: evalAfterRetro } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
                if (evalAfterRetro) relationshipProgress = evalAfterRetro;
                const { data: tmplRetroRow } = await supabaseAdmin
                  .from('character_latent_profiles')
                  .select('relationship_goals')
                  .eq('character_id', characterId)
                  .maybeSingle();
                const tmplRetro = tmplRetroRow?.relationship_goals;
                if (tmplRetro && tmplRetro.enabled && Array.isArray(tmplRetro.path)) {
                  const activeOrderR = relationshipProgress.active_order || 1;
                  const activeStageR = tmplRetro.path.find((p:any)=> (p.order||p.order===0) && p.order === activeOrderR);
                  if (activeStageR) {
                    const nextStageR = tmplRetro.path.find((p:any)=> (p.order||p.order===0) && p.order === activeOrderR + 1);
                    let relStrR = `Stage ${activeOrderR}/${tmplRetro.path.length}: ${activeStageR.label}` + (activeStageR.description ? ` - ${activeStageR.description}` : '');
                    if (nextStageR) relStrR += `. Character has already invited user to become ${nextStageR.label} and is awaiting explicit acceptance.`;
                    const metaR = { ...relationshipProgress, total_stages: tmplRetro.path.length };
                    const { data: ctxRowR } = await supabaseAdmin.from('chat_context').select('current_context').eq('chat_id', chatId).maybeSingle();
                    const persistedR = await persistRelationshipContext({ supabaseAdmin, userId: user.id, chatId, characterId, currentContext: ctxRowR?.current_context||{}, relationship: relStrR, meta: metaR, requestId });
                    if (persistedR) await broadcastRelationshipContext({ supabaseAdmin, userId: user.id, characterId, relationship: relStrR, meta: metaR, requestId, excludeChatId: chatId });
                  }
                }
              } catch (e) { logger.warn('relationship.invitation.retroPersist.error', { requestId, chatId, message: (e as Error)?.message }); }
              logger.debug('relationship.invitation.retroMark', { requestId, chatId });
            }
          }
        }
      }
    } catch (e) { logger.warn('relationship.invitation.retroDetect.error', { requestId, chatId, message: (e as Error)?.message }); }

    // DECLINE DETECTION: mark invitation declined
    try {
      if (relationshipProgress && relationshipProgress.invitation_status === 'asked_pending') {
        const lowerMsg = message.toLowerCase();
        const declinePatterns = [
          /(i\s+don['’]t|i\s+do not)\s+(want|think)\s+(to\s+)?(advance|move|be|become)/,
          /(not|no)\s+(yet|now|ready)/,
          /maybe\s+later/,
          /prefer\s+to\s+wait/,
          /need\s+more\s+time/,
          /too\s+soon/,
          /slow\s+down/
        ];
        if (declinePatterns.some(r=> r.test(lowerMsg))) {
          const { error: decErr } = await supabaseAdmin.rpc('set_relationship_invitation_status', { p_user_id: user.id, p_character_id: characterId, p_action: 'declined' });
          if (!decErr) {
            relationshipProgress.invitation_status = 'asked_declined';
            // Refresh & persist context
            try {
              const { data: evalAfterDecline } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
              if (evalAfterDecline) relationshipProgress = evalAfterDecline;
              const { data: tmplDeclineRow } = await supabaseAdmin
                .from('character_latent_profiles')
                .select('relationship_goals')
                .eq('character_id', characterId)
                .maybeSingle();
              const tmplDecline = tmplDeclineRow?.relationship_goals;
              if (tmplDecline && tmplDecline.enabled && Array.isArray(tmplDecline.path)) {
                const activeOrderD = relationshipProgress.active_order || 1;
                const activeStageD = tmplDecline.path.find((p:any)=> (p.order||p.order===0) && p.order === activeOrderD);
                if (activeStageD) {
                  const nextStageD = tmplDecline.path.find((p:any)=> (p.order||p.order===0) && p.order === activeOrderD + 1);
                  let relStrD = `Stage ${activeOrderD}/${tmplDecline.path.length}: ${activeStageD.label}` + (activeStageD.description ? ` - ${activeStageD.description}` : '');
                  if (nextStageD && relationshipProgress.ready_for_next) relStrD += `. Character previously invited user to become ${nextStageD.label} and the user declined; do not re-invite unless user clearly reopens or proposes advancement.`;
                  const metaD = { ...relationshipProgress, total_stages: tmplDecline.path.length };
                  const { data: ctxRowD } = await supabaseAdmin.from('chat_context').select('current_context').eq('chat_id', chatId).maybeSingle();
                  const persistedD = await persistRelationshipContext({ supabaseAdmin, userId: user.id, chatId, characterId, currentContext: ctxRowD?.current_context||{}, relationship: relStrD, meta: metaD, requestId });
                  if (persistedD) await broadcastRelationshipContext({ supabaseAdmin, userId: user.id, characterId, relationship: relStrD, meta: metaD, requestId, excludeChatId: chatId });
                }
              }
            } catch (e) { logger.warn('relationship.invitation.declinePersist.error', { requestId, chatId, message: (e as Error)?.message }); }
            logger.info('relationship.invitation.declined', { requestId, chatId });
          }
        }
      }
    } catch (e) { logger.warn('relationship.invitation.declineDetect.error', { requestId, chatId, message: (e as Error)?.message }); }

    // If we are awaiting a regression confirmation (prompt previously asked) interpret this user message's sentiment
    if (relationshipProgress && relationshipProgress.pending_regression && relationshipProgress.regression_prompt_asked && relationshipProgress.regression_candidate_order) {
      const lowerMsg = message.toLowerCase();
      const negativeIndicators = ['distant','distance','apart','worse','regress','falling back','less close','pulled away','pulling away','cold','colder','upset','angry','hurt','uncomfortable','withdraw','drifting','drift','separate','not working','lost spark','lost the spark'];
      const positiveIndicators = ['close','closer','strong','stronger','stable','good','great','bond','trust','love','affection','intimate','same as','still the same','no change','fine'];
      let negScore = 0; let posScore = 0;
      for (const term of negativeIndicators) { if (lowerMsg.includes(term)) negScore++; }
      for (const term of positiveIndicators) { if (lowerMsg.includes(term)) posScore++; }
      // Additional polarity: simple emotive words
      if (/\b(no|not)\b.*\b(regress|worse|back)\b/.test(lowerMsg)) posScore += 2; // explicit denial of regression
      if (/\b(feel|feels|feeling)\b.*\b(less|more)\b.*\b(close|distant)\b/.test(lowerMsg)) { if (/(less).*close/.test(lowerMsg)) negScore++; if (/(more).*close/.test(lowerMsg)) posScore++; }

      const decision = negScore > posScore ? 'confirm' : (posScore > negScore ? 'cancel' : 'undecided');
      if (decision === 'confirm') {
        try {
          const { data: newState } = await supabaseAdmin.rpc('confirm_relationship_regression', { p_user_id: user.id, p_character_id: characterId });
          relationshipProgress = newState || relationshipProgress;
          // Update canonical relationship string + meta in chat_context
          try {
            const { data: tmplRow } = await supabaseAdmin
              .from('character_latent_profiles')
              .select('relationship_goals')
              .eq('character_id', characterId)
              .maybeSingle();
            const tmpl = tmplRow?.relationship_goals;
            if (tmpl && tmpl.enabled && Array.isArray(tmpl.path)) {
              const activeOrder = relationshipProgress?.active_order;
              const activeStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === activeOrder);
              if (activeStage) {
                const relationship = `Stage ${activeOrder}/${tmpl.path.length}: ${activeStage.label}${activeStage.description ? ' - ' + activeStage.description : ''}`;
                const meta = { ...relationshipProgress, total_stages: tmpl.path.length };
                const { data: ctxRow } = await supabaseAdmin.from('chat_context').select('current_context').eq('chat_id', chatId).maybeSingle();
                await persistRelationshipContext({
                  supabaseAdmin,
                  userId: user.id,
                  chatId,
                  characterId,
                  currentContext: ctxRow?.current_context || {},
                  relationship,
                  meta,
                  requestId
                });
              }
            }
          } catch (e) { logger.warn('relationship.regression.contextUpdate.error', { requestId, chatId, message: (e as Error)?.message }); }
          logger.info('relationship.regression.confirmed', { requestId, chatId, newActive: relationshipProgress?.active_order });
        } catch (e) {
          logger.warn('relationship.regression.confirm.fail', { requestId, chatId, message: (e as Error)?.message });
        }
      } else if (decision === 'cancel') {
        // Clear pending regression flags and streak manually
        try {
          await supabaseAdmin.from('user_character_relationship_progress')
            .update({ state: (supabaseAdmin as any).sql`state - 'pending_regression' - 'regression_candidate_order' - 'regression_prompt_asked' || jsonb_build_object('pending_regression', false, 'negative_streak', 0)` })
            .eq('user_id', user.id)
            .eq('character_id', characterId);
          // Refresh state
          try {
            const { data: refreshed } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
            if (refreshed) relationshipProgress = refreshed;
          } catch {}
          logger.info('relationship.regression.cancelled', { requestId, chatId });
        } catch (e) {
          logger.warn('relationship.regression.cancel.fail', { requestId, chatId, message: (e as Error)?.message });
        }
      } else {
        logger.debug('relationship.regression.awaitingMoreSignal', { requestId, chatId });
      }
    }

    // After regression handling but before time awareness & conversation assembly, manage relationship readiness & advancement
    if (relationshipProgress && !relationshipProgress.skipped) {
      try {
        // Fetch template once
        const { data: tmplRow } = await supabaseAdmin
          .from('character_latent_profiles')
          .select('relationship_goals')
          .eq('character_id', characterId)
          .maybeSingle();
        const tmpl = tmplRow?.relationship_goals;
        if (tmpl && tmpl.enabled && Array.isArray(tmpl.path) && tmpl.path.length >= 2) {
          const activeOrder = relationshipProgress.active_order || 1;
          const activeStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === activeOrder);
          const nextStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === activeOrder + 1);
          const readyForNext = !!relationshipProgress.ready_for_next;
          // REL_ADV: Only perform intent scanning when actually ready & a next stage exists
          let advanced = false;
      if (readyForNext && nextStage) {
            const userLower = message.toLowerCase();
            const labelLower = String(nextStage.label||'').toLowerCase();
            // Fast negation guard (avoid false positives)
            const negation = /(don['’]t|do not|not|never)\s+(want|ready|be|become|move|advance|date|marry)/.test(userLower);
            if (!negation) {
              const relationalHints = ['be ', 'become', 'together', 'date', 'girlfriend', 'boyfriend', 'wife', 'husband', 'marry', 'engage', 'partner', 'official', 'relationship', 'couple'];
              const labelTokens = labelLower.split(/[^a-z0-9]+/).filter(t=>t.length>2);
              const hintHit = relationalHints.some(h=> userLower.includes(h));
              const labelHit = labelTokens.some(t=> userLower.includes(t));
              let intentDetected = false;
        let classifierAttempted = false;
        logger.debug('relationship.advance.intentScan.start', { requestId, chatId, hintHit, labelHit, readyForNext });
              // Detect acceptance of prior invitation
              try {
                const lastAiMsg = (messageHistory||[]).slice().reverse().find((m:any)=> m && m.is_ai_message)?.content?.toLowerCase() || '';
                const invitationPatterns = [
                  /take (this|things) to the next level/,
                  /ready to (?:move|advance)/,
                  /do you (?:feel|think) (?:we|you)('re)? ready/,
                  /want to (?:be|become)/,
                  new RegExp(`move into ${labelLower.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}`)
                ];
                const invitationIssued = invitationPatterns.some(p=> p.test(lastAiMsg)) || lastAiMsg.includes(labelLower);
                if (invitationIssued) {
                  const acceptancePatterns = [
                    /^(?:\s*(yes|yeah|yep|sure|ok|okay|absolutely|definitely|of course)\b.*)$/,
                    /\b(let'?s|lets) do it\b/,
                    /\bmake it official\b/,
                    /\bI'?d love to\b/,
                    /\bI (?:really )?want to\b/,
                    /\bthat sounds (good|great|perfect|amazing|wonderful)\b/,
                    /\bcount me in\b/,
                    /\bgo ahead\b/
                  ];
                  const passiveAccept = acceptancePatterns.some(p=> p.test(userLower)) && !/(not|don't|dont|never)\s+(want|sure|ready)/.test(userLower);
                  if (passiveAccept) {
                    intentDetected = true;
                    logger.debug('relationship.advance.acceptanceDetected', { requestId, chatId });
                  }
                }
              } catch (e) { logger.warn('relationship.advance.acceptanceCheck.error', { requestId, chatId, message: (e as Error)?.message }); }

              if ((hintHit || labelHit || intentDetected) && !intentDetected) {
                // Optional classifier (lightweight) only if no intent yet but lexical hints present
                const openRouterKey = getEnv('OPENROUTER_API_KEY');
                if (openRouterKey && message.length < 1200) {
                  try {
                    const clfPrompt = [
                      'You are an intent classifier. Decide if the USER is explicitly requesting to advance the RELATIONSHIP to the NEXT_STAGE.',
                      'Return ONLY compact JSON: {"advancement_request":true|false,"reason":"short"}.',
                      `CURRENT_STAGE:${activeStage?.label || 'Unknown'}`,
                      `NEXT_STAGE:${nextStage.label}`,
                      `LAST_AI_INVITE:${(messageHistory||[]).slice().reverse().find((m:any)=> m && m.is_ai_message)?.content?.slice(0,180) || ''}`,
                      `USER:${message.slice(0,400)}`,
                      'Guidelines:',
                      '- advancement_request true ONLY if the user is clearly proposing / asking / accepting entering NEXT_STAGE (explicit proposal or acceptance).',
                      '- Generic affection or hypotheticals -> false.',
                      '- Ambiguous -> false.'
                    ].join('\n');
                    const clfRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        model: 'mistralai/mistral-small-3.1-instruct',
                        temperature: 0,
                        max_tokens: 40,
                        messages: [{ role: 'user', content: clfPrompt }]
                      })
                    });
                    if (clfRes.ok) {
                      const clfJson: any = await clfRes.json();
                      const content = clfJson?.choices?.[0]?.message?.content || '';
                      try {
                        const parsed = JSON.parse(content.replace(/```json|```/gi,'').trim());
                        intentDetected = parsed?.advancement_request === true;
                        logger.debug('relationship.advance.classifier', { requestId, chatId, intentDetected, reason: parsed?.reason });
                        classifierAttempted = true;
                      } catch { /* parse ignore */ }
                    }
                  } catch (e) {
                    logger.warn('relationship.advance.classifier.error', { requestId, chatId, message: (e as Error)?.message });
                  }
                }
              }

              // Fallback: if we had lexical hits but no classifier attempted (missing key) treat as intent unless clearly ambiguous (single generic word only)
              if (!intentDetected && (hintHit || labelHit) && !classifierAttempted) {
                const trimmed = message.trim().toLowerCase();
                const ambiguous = ['relationship','together','partner'].includes(trimmed); // overly generic single-word replies
                if (!ambiguous) {
                  intentDetected = true;
                  logger.debug('relationship.advance.lexicalFallbackIntent', { requestId, chatId, hintHit, labelHit });
                }
              }

              logger.debug('relationship.advance.intentScan.final', { requestId, chatId, intentDetected, hintHit, labelHit, classifierAttempted });

              if (hintHit || labelHit || intentDetected) {
                if (intentDetected) {
                  try {
                    const { data: newState, error: advErr } = await supabaseAdmin.rpc('advance_relationship_stage', { p_user_id: user.id, p_character_id: characterId });
                    if (!advErr && newState && !newState.error) {
                      relationshipProgress = newState; // adopt new state (invitation fields cleared)
                      advanced = true;
                      logger.info('relationship.advance.success', { requestId, chatId, newActive: newState.active_order, via: 'acceptanceOrIntent' });
                      // Post-advance evaluation to refresh thresholds
                      try {
                        const { data: postEval, error: postEvalErr } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
                        if (!postEvalErr && postEval) {
                          relationshipProgress = postEval;
                          logger.debug('relationship.advance.postEval', {
                            requestId,
                            chatId,
                            active_order: postEval.active_order,
                            next_threshold: postEval.next_threshold,
                            current_stage_threshold: postEval.current_stage_threshold,
                            stage_progress_percent: postEval.stage_progress_percent
                          });
                        } else {
                          logger.warn('relationship.advance.postEval.fail', { requestId, chatId, err: postEvalErr?.message });
                        }
                      } catch (e) {
                        logger.warn('relationship.advance.postEval.exception', { requestId, chatId, message: (e as Error)?.message });
                      }
                      // Broadcast new stage canonical string immediately
                      try {
                        const { data: tmplAdvRow } = await supabaseAdmin
                          .from('character_latent_profiles')
                          .select('relationship_goals')
                          .eq('character_id', characterId)
                          .maybeSingle();
                        const tmplAdv = tmplAdvRow?.relationship_goals;
                        if (tmplAdv && tmplAdv.enabled && Array.isArray(tmplAdv.path)) {
                          const activeOrderAdv = relationshipProgress.active_order || 1;
                          const activeStageAdv = tmplAdv.path.find((p:any)=> (p.order||p.order===0) && p.order === activeOrderAdv);
                          if (activeStageAdv) {
                            const relStrAdv = `Stage ${activeOrderAdv}/${tmplAdv.path.length}: ${activeStageAdv.label}` + (activeStageAdv.description ? ` - ${activeStageAdv.description}` : '') + (activeOrderAdv === tmplAdv.path.length ? '. Final relationship stage.' : '');
                            const metaAdv = { ...relationshipProgress, total_stages: tmplAdv.path.length };
                            await broadcastRelationshipContext({ supabaseAdmin, userId: user.id, characterId, relationship: relStrAdv, meta: metaAdv, requestId, excludeChatId: chatId });
                          }
                        }
                      } catch (e) { logger.warn('relationship.advance.broadcast.error', { requestId, chatId, message: (e as Error)?.message }); }
                    } else {
                      const detail = newState?.error || advErr?.message;
                      logger.warn('relationship.advance.denied', { requestId, chatId, detail, stateReady: relationshipProgress?.ready_for_next });
                    }
                  } catch (e) {
                    logger.warn('relationship.advance.rpc.error', { requestId, chatId, message: (e as Error)?.message });
                  }
                }
              }
            } else if (negation) {
              logger.debug('relationship.advance.negationGuard', { requestId, chatId });
            }
          }

          // Build canonical with readiness note AFTER possible advancement
          const finalActiveOrder = relationshipProgress?.active_order || activeOrder;
          const finalActiveStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === finalActiveOrder);
          const finalNextStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === finalActiveOrder + 1);
          const finalReady = !!relationshipProgress?.ready_for_next;
          const invitationStatus = (relationshipProgress as any)?.invitation_status || (relationshipProgress as any)?.state?.invitation_status;
          // We'll capture expected invitation so streaming completion can detect actual ask
          let expectInvitation: { nextLabel: string } | null = null;
          let relationshipStr = '';
          if (finalActiveStage) {
            relationshipStr = `Stage ${finalActiveOrder}/${tmpl.path.length}: ${finalActiveStage.label}` + (finalActiveStage.description ? ` - ${finalActiveStage.description}` : '');
            if (finalNextStage) {
              if (finalReady) {
                if (invitationStatus === 'ready_unasked') {
                  relationshipStr += `. Character is ready to move into ${finalNextStage.label}. Invitation not yet asked.`;
                  expectInvitation = { nextLabel: finalNextStage.label };
                } else if (invitationStatus === 'asked_pending') {
                  relationshipStr += `. Character has already invited user to become ${finalNextStage.label} and is awaiting explicit acceptance.`;
                } else if (invitationStatus === 'asked_declined') {
                  relationshipStr += `. Character previously invited user to become ${finalNextStage.label} and the user declined; do not re-invite unless user clearly reopens or proposes advancement.`;
                } else {
                  relationshipStr += `. Character is ready to move into ${finalNextStage.label}.`;
                }
              } else {
                relationshipStr += `. Character is not ready to move into ${finalNextStage.label}.`;
              }
            } else {
              relationshipStr += '. Final relationship stage.';
            }
          }
          if (relationshipStr) {
            try {
              const meta = { ...relationshipProgress, total_stages: tmpl.path.length };
              // In-memory update for prompt assembly
              const mutableCtx: any = currentContext && typeof currentContext === 'object' ? { ...currentContext } : {};
              mutableCtx.relationship = relationshipStr;
              mutableCtx.relationship_meta = meta;
              // Remove legacy key if present
              if ('relationshipStatus' in mutableCtx) delete mutableCtx.relationshipStatus;
              // Attach expected invitation hint (ephemeral, not persisted)
              if (expectInvitation) mutableCtx._expected_relationship_invitation = expectInvitation;
              currentContext = mutableCtx;
              // Persist if changed
              await persistRelationshipContext({
                supabaseAdmin,
                userId: user.id,
                chatId,
                characterId,
                currentContext: mutableCtx, // contains latest values; helper will diff against DB values
                relationship: relationshipStr,
                meta,
                requestId
              });
              // Store expectation in outer scope for streaming completion (closure over expectInvitation)
              (relationshipProgress as any)._expectInvitationNextLabel = expectInvitation?.nextLabel;
            } catch (e) {
              logger.warn('relationship.context.persist.cycle.error', { requestId, chatId, message: (e as Error)?.message });
            }
          }
        }
      } catch (e) {
        logger.warn('relationship.advance.block.error', { requestId, chatId, message: (e as Error)?.message });
      }
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
          // Detect if AI actually issued an invitation this turn (only if we expected one)
          try {
            const expectedLabel = (relationshipProgress as any)?._expectInvitationNextLabel;
            if (expectedLabel && ((relationshipProgress as any)?.invitation_status === 'ready_unasked')) {
              const lower = full.toLowerCase();
              const labelLower = String(expectedLabel).toLowerCase();
              const escapedLabel = labelLower.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
              const invitePatterns = [
                /\bwould you (?:like|want) to (?:be|become|move into)\b/,
                /\bshall we (?:become|move into)\b/,
                /\bmove into (?:the )?next stage\b/,
                new RegExp(`\b(become|be|enter|move into)\b.*${escapedLabel}`),
                new RegExp(`move into ${escapedLabel}`)
              ];
              const invited = invitePatterns.some(p=> p.test(lower));
              if (invited) {
                const { data: markData, error: invErr } = await supabaseAdmin.rpc('set_relationship_invitation_status', { p_user_id: user.id, p_character_id: characterId, p_action: 'asked' });
                if (invErr) {
                  logger.warn('relationship.invitation.postDetect.fail', { requestId, chatId, err: invErr.message });
                } else {
                  relationshipProgress.invitation_status = 'asked_pending';
                  logger.debug('relationship.invitation.postDetect.marked', { requestId, chatId });
                }
              } else {
                logger.debug('relationship.invitation.postDetect.noInvite', { requestId, chatId });
              }
            }
          } catch (e) {
            logger.warn('relationship.invitation.postDetect.exception', { requestId, chatId, message: (e as Error)?.message });
          }
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
          triggerAddonExtraction({ addonsActive, supabaseUrl: env('SUPABASE_URL'), authHeader: req.headers.get('Authorization'), chatId, characterId, effectiveAddonSettings, message, aiResponse: full, messageId: 'final' })
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
