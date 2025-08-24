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

    // Evaluate relationship progress early to potentially short-circuit with regression prompt / handle user response
    let relationshipProgress: any = null;
    try {
      const { data: evalState, error: evalErr } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
      if (evalErr) {
        logger.warn('relationship.eval.error', { requestId, chatId, msg: evalErr.message });
      } else {
        relationshipProgress = evalState;
      }
    } catch (e) {
      logger.warn('relationship.eval.exception', { requestId, chatId, message: (e as Error)?.message });
    }

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
          // Update canonical relationship string in chat_context
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
                const stageStr = `Stage ${activeOrder}/${tmpl.path.length}: ${activeStage.label}${activeStage.description ? ' - ' + activeStage.description : ''}`;
                const { data: ctxRow } = await supabaseAdmin.from('chat_context').select('current_context').eq('chat_id', chatId).maybeSingle();
                const merged = { ...(ctxRow?.current_context || {}), relationship: stageStr };
                await supabaseAdmin.from('chat_context').upsert({ chat_id: chatId, user_id: user.id, character_id: characterId, current_context: merged }, { onConflict: 'chat_id' });
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

          // Heuristic pre-check for possible advancement intent (only when ready and next exists)
          let advanced = false;
          if (readyForNext && nextStage) {
            const userLower = message.toLowerCase();
            const labelLower = String(nextStage.label||'').toLowerCase();
            const relationalHints = ['be ', 'become', 'together', 'date', 'girlfriend', 'boyfriend', 'wife', 'husband', 'marry', 'engage', 'partner', 'official', 'relationship', 'couple'];
            const labelTokens = labelLower.split(/[^a-z0-9]+/).filter(t=>t.length>2);
            const hintHit = relationalHints.some(h=> userLower.includes(h));
            const labelHit = labelTokens.some(t=> userLower.includes(t));
            let intentDetected = false;

            // NEW: detect acceptance of a prior invitation even if user message lacks stage-specific tokens
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
                  /^\s*yes[!.]?\s*$/,
                  /^\s*yeah[!.]?\s*$/,
                  /^\s*sure[!.]?\s*$/,
                  /\b(let'?s|lets) do it\b/,
                  /\bmake it official\b/,
                  /\bI'?d love to\b/,
                  /\bI want to\b/,
                  /\bthat sounds (good|great|perfect|amazing)\b/,
                  /\bokay[!.]?$/,
                  /\bof course\b/,
                  /\babsolutely\b/,
                  /\bdefinitely\b/
                ];
                const passiveAccept = acceptancePatterns.some(p=> p.test(userLower));
                // Guard against accidental yes to unrelated question by requiring short affirmative or includes advancement keyword context
                if (passiveAccept) {
                  intentDetected = true;
                  logger.debug('relationship.advance.acceptanceDetected', { requestId, chatId });
                }
              }
            } catch (e) { logger.warn('relationship.advance.acceptanceCheck.error', { requestId, chatId, message: (e as Error)?.message }); }

            if (hintHit || labelHit || intentDetected) {
              // Optional lightweight model classification to reduce false positives
              const openRouterKey = getEnv('OPENROUTER_API_KEY');
              if (!intentDetected && openRouterKey) {
                try {
                  const clfPrompt = [
                    'You are an intent classifier. Decide if the USER is explicitly requesting to advance the RELATIONSHIP to the NEXT_STAGE.',
                    'Return ONLY compact JSON: {"advancement_request":true|false,"reason":"short"}.',
                    `CURRENT_STAGE:${activeStage?.label || 'Unknown'}`,
                    `NEXT_STAGE:${nextStage.label}`,
                    `LAST_AI_INVITE:${(messageHistory||[]).slice().reverse().find((m:any)=> m && m.is_ai_message)?.content?.slice(0,180) || ''}`,
                    `USER:${message.slice(0,400)}`,
                    'Guidelines:',
                    '- advancement_request true ONLY if the user is clearly proposing / asking / accepting entering NEXT_STAGE (explicit proposal or acceptance of model invitation).',
                    '- Generic affection without clear acceptance is false.',
                    '- If ambiguous -> false.'
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
                      if (parsed && parsed.advancement_request === true) intentDetected = true; else intentDetected = false;
                      logger.debug('relationship.advance.classifier', { requestId, chatId, intentDetected, reason: parsed?.reason });
                    } catch { /* ignore parse failure */ }
                  }
                } catch (e) {
                  logger.warn('relationship.advance.classifier.error', { requestId, chatId, message: (e as Error)?.message });
                }
              }

              if (intentDetected) {
                try {
                  const { data: newState, error: advErr } = await supabaseAdmin.rpc('advance_relationship_stage', { p_user_id: user.id, p_character_id: characterId });
                  if (!advErr && newState && !newState.error) {
                    relationshipProgress = newState; // adopt new state
                    advanced = true;
                    logger.info('relationship.advance.success', { requestId, chatId, newActive: newState.active_order, via: 'acceptanceOrIntent' });
                    // NEW: immediate post-advance evaluation to refresh thresholds / progress metrics
                    try {
                      const { data: postEval, error: postEvalErr } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
                      if (!postEvalErr && postEval) {
                        relationshipProgress = postEval; // refreshed state with next_threshold, stage_progress values
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
                  } else {
                    logger.debug('relationship.advance.denied', { requestId, chatId, detail: newState?.error || advErr?.message });
                  }
                } catch (e) {
                  logger.warn('relationship.advance.rpc.error', { requestId, chatId, message: (e as Error)?.message });
                }
              }
            }
          }

          // Build canonical with readiness note AFTER possible advancement
          const finalActiveOrder = relationshipProgress?.active_order || activeOrder;
          const finalActiveStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === finalActiveOrder);
          const finalNextStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === finalActiveOrder + 1);
          const finalReady = !!relationshipProgress?.ready_for_next;
          let stageStr = '';
          if (finalActiveStage) {
            stageStr = `Stage ${finalActiveOrder}/${tmpl.path.length}: ${finalActiveStage.label}` + (finalActiveStage.description ? ` - ${finalActiveStage.description}` : '');
            if (finalNextStage) {
              if (finalReady) {
                stageStr += `. Character is ready to move into ${finalNextStage.label}. Advancement only occurs if the user explicitly requests it. If the user only hints indirectly or is ambiguous, politely ask for explicit confirmation before advancing. Do NOT self-initiate advancement. Do NOT skip stages.`;
                stageStr += ` Next Stage Details: ${finalNextStage.label}${finalNextStage.description ? ' - ' + finalNextStage.description : ''}.`;
              } else {
                stageStr += `. Character is not ready to move into ${finalNextStage.label}. If the user asks, hints, insinuates, roleplays, or proposes advancing to ${finalNextStage.label} (or any wording implying entering that stage), you MUST politely decline and explain you are not ready yet. Do NOT pretend to already be in ${finalNextStage.label}. Encourage continuing to build the current stage first.`;
                stageStr += ` Next Stage Details: ${finalNextStage.label}${finalNextStage.description ? ' - ' + finalNextStage.description : ''}.`;
              }
            } else {
              stageStr += '. Final relationship stage.';
            }
          }
          if (stageStr) {
            try {
              // Previously persisted into chat_context; now we only update in-memory context for this response cycle
              let mutableCtx: any = currentContext && typeof currentContext === 'object' ? { ...currentContext } : {};
              mutableCtx.relationshipStatus = stageStr;
              currentContext = mutableCtx;
              // Removed DB upsert to avoid injecting stage instructions into persistent chat_context.
            } catch (e) {
              logger.warn('relationship.context.localUpdate.error', { requestId, chatId, message: (e as Error)?.message });
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
