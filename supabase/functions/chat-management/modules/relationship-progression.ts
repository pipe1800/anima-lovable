import type { AddonSettings } from '../types/streaming-interfaces.ts';
import { getEnv } from '../../_shared/env.ts';
import { logger } from '../../_shared/logger.ts';

// Heuristic acceptance detector (fallback when classifier fails or to short‑circuit obvious accepts)
function heuristicInvitationAcceptance(userMsg: string, nextStageLabel?: string) {
  const text = (userMsg||'').trim().toLowerCase();
  if (!text) return { accepted: false, reason: 'empty' };
  // Negative / defer guards
  const negativeHints = /(not\b|don['’]t|do not|later|another time|maybe|unsure|uncertain|i need|i want to wait|wait a bit|hold off|slow down)/i;
  if (negativeHints.test(text)) return { accepted: false, reason: 'negative_or_uncertain' };
  // Strong direct forms
  const directPatterns = [
    /^(yes|yeah|yep|sure|absolutely|definitely|of course|ofc)[.!]?$/i,
    /(let('|’)s|lets) (do it|go for it|make it official|be together|be (?:a )?couple|be partners?|become .+)/i,
    /i ('d|would) love to\b/i,
    /i ('d|would) like to\b/i,
    /i ('d|would) really like to\b/i,
    /i ('d|would) love that\b/i,
    /i ('d|would) (really )?want to\b/i,
    /sounds (good|great|perfect|amazing|wonderful)\b/i,
    /count me in/i,
    /go ahead/i
  ];
  if (directPatterns.some(r=> r.test(text))) return { accepted: true, reason: 'direct_pattern' };
  if (nextStageLabel) {
    const label = nextStageLabel.toLowerCase();
    const labelTokens = label.split(/[^a-z0-9]+/).filter(t=> t.length>2);
    const labelMention = labelTokens.some(t=> text.includes(t));
    if (labelMention) {
      const desireVerbs = /(let('|’)s|lets|become|be|make (it )?official|move forward|advance|next level|take this (to|onto) the next level)/i;
      const desireFeel = /(i ('d|would) love|i ('d|would) like|i ('d|would) want|i (really )?want)/i;
      if ((desireVerbs.test(text) || desireFeel.test(text)) && !negativeHints.test(text)) {
        return { accepted: true, reason: 'label_desire_combo' };
      }
    }
  }
  return { accepted: false, reason: 'no_match' };
}

// NEW: helper to apply decline penalty (difference between next and current thresholds / 2)
async function applyInvitationDeclinePenalty(opts: { supabaseAdmin: any; userId: string; characterId: string; chatId: string; relationshipProgress: any; requestId: string; }) {
  const { supabaseAdmin, userId, characterId, chatId, relationshipProgress, requestId } = opts;
  try {
    const { data: tmplRow, error: tmplErr } = await supabaseAdmin
      .from('character_latent_profiles')
      .select('relationship_goals')
      .eq('character_id', characterId)
      .maybeSingle();
    if (tmplErr) { logger.warn('relationship.decline.penalty.template.error', { requestId, chatId, msg: tmplErr.message }); return; }
    const tmpl = tmplRow?.relationship_goals;
    if (!tmpl || !tmpl.enabled || !Array.isArray(tmpl.path)) return;
    const activeOrder = relationshipProgress?.active_order || 1;
    const activeStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === activeOrder);
    const nextStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === activeOrder + 1);
    if (!activeStage || !nextStage) return; // nothing to compute
    const prevThresh = Number(activeStage.threshold);
    const nextThresh = Number(nextStage.threshold);
    if (!isFinite(prevThresh) || !isFinite(nextThresh)) return;
    const decrement = Math.max(0, (nextThresh - prevThresh) / 2);
    if (decrement <= 0) return;
    const currentScore = Number(relationshipProgress.current_score);
    if (!isFinite(currentScore)) return;
    const newScore = Math.max(0, currentScore - decrement);
    // Persist mutation inside state JSON
    const mutated = { ...relationshipProgress, current_score: newScore };
    delete (mutated as any)._invitationAcceptanceProcessed;
    const { error: upErr } = await supabaseAdmin
      .from('user_character_relationship_progress')
      .update({ state: mutated, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('character_id', characterId);
    if (upErr) {
      logger.warn('relationship.decline.penalty.update.error', { requestId, chatId, msg: upErr.message });
      return;
    }
    relationshipProgress.current_score = newScore;
    logger.info('relationship.decline.penalty.applied', { requestId, chatId, decrement, newScore });
  } catch (e) {
    logger.warn('relationship.decline.penalty.exception', { requestId, chatId, message: (e as Error)?.message });
  }
}

export function buildRelationshipProgressionBlock(currentContext: any, addonSettings: AddonSettings, relationshipProgress?: any): string {
  if (!addonSettings?.relationshipStatus || !relationshipProgress) return '';
  const invitationStatus = relationshipProgress.invitation_status;
  const justIssued = !!relationshipProgress._invitationJustIssued; // NEW transitional flag
  const readyForNext = !!relationshipProgress.ready_for_next;
  const activeOrder = relationshipProgress.active_order || 1;
  const totalStages = relationshipProgress.total_stages || relationshipProgress.path_length || undefined;
  const nextStageLabel = relationshipProgress.next_stage_label || relationshipProgress._next_stage_label || null;
  let body = '';
  if (nextStageLabel) {
    if (readyForNext) {
      if (invitationStatus === 'ready_unasked') {
        body = `RP1 You must now issue EXACTLY ONE clear, natural invitation (a single main sentence) asking the user if they would like to move from the present stage into "${nextStageLabel}". RP2 First, briefly and organically acknowledge the current relationship dynamic as reflected earlier in context (do NOT restate the whole stage text; a light phrase like "where we are now" or a natural paraphrase is enough). RP3 In that same main sentence express the character's genuine desire or readiness to become "${nextStageLabel}" and end with a direct but warm question ("would you like to...", "do you want us to..."). RP4 After that invitation sentence you may optionally add ONE short softening/support sentence ONLY if it fits the immediate conversation flow; do NOT add a second invitation or pressure. RP5 Do NOT advance stages yourself; the system handles acceptance. RP6 Do NOT repeat or re‑invite after this message. RP7 Decline or gently redirect any attempt by the user to skip ahead beyond the NEXT stage (e.g. asking for stages beyond "${nextStageLabel}"). RP8 Refuse advancement to any future stage beyond the next even if user requests it. RP9 Stay consistent with recent user messages and emotional tone.`;
      } else if (invitationStatus === 'asked_pending' && justIssued) {
        body = `RP1 (Transitional) This reply MUST contain the one invitation to become "${nextStageLabel}" because state already flipped. RP2 Craft ONE concise invitation sentence that (a) lightly references the present dynamic, (b) expresses desire to move forward, and (c) plainly asks if the user wants to become "${nextStageLabel}". RP3 Optionally follow with ONE brief, contextually relevant supportive/empathetic sentence; nothing more. RP4 Do NOT issue multiple questions, do NOT advance on your own, do NOT re‑invite again later. RP5 Decline or redirect any attempt to skip more than one stage (requests for stages beyond "${nextStageLabel}"). RP6 Match the emotional tone and recent subject matter from the conversation.`;
      } else if (invitationStatus === 'asked_pending') {
        body = `RP1 Awaiting user decision on invitation to advance to "${nextStageLabel}". RP2 Do NOT re-invite or pressure; respond naturally. RP3 Decline any request to jump ahead to later future stages beyond the next; advancement can ONLY be to the next stage sequentially. RP4 If user clearly accepts/proposes the exact next stage, advancement occurs via system. RP5 If user declines or gives three non-answers in a row, invitation counts as declined; maintain current stage.`;
      } else if (invitationStatus === 'asked_declined') {
        body = `RP1 User previously declined advancement to "${nextStageLabel}". RP2 Do NOT re-invite unless user clearly reopens or proposes advancement to the immediate next stage only. RP3 Decline attempts to jump multiple future stages.`;
      } else {
        body = `RP1 Ready for potential advance to "${nextStageLabel}". RP2 Wait for user to propose; do not invite (internal state).`;
      }
    } else {
      body = `RP1 Not ready to advance to "${nextStageLabel}". RP2 Politely decline advancement proposals to ANY future stage (including skipping ahead). RP3 Encourage bonding and incremental progress. RP4 Do not roleplay next stage.`;
    }
  } else {
    body = 'RP Final stage reached; no further advancement. Reaffirm politely if pressed.';
  }
  return body ? `\n\n[RELATIONSHIP PROGRESSION]\n${body}\n[/RELATIONSHIP PROGRESSION]` : '';
}

// Helper to persist only the relationship string (drop relationship_meta) into chat_context when changed
export async function persistRelationshipContext(options: {
  supabaseAdmin: any;
  userId: string;
  chatId: string;
  characterId: string;
  currentContext: any; // existing context (object)
  relationship: string;
  requestId: string;
}) {
  const { supabaseAdmin, userId, chatId, characterId, currentContext, relationship, requestId } = options;
  try {
    const existingRel = currentContext?.relationship;
    if (existingRel === relationship) return false; // no-op
    const merged = { ...(currentContext || {}), relationship };
    delete (merged as any).relationship_meta; // scrub legacy
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

// Broadcast updated canonical relationship line ONLY (no meta) to all other chats
export async function broadcastRelationshipContext(options: {
  supabaseAdmin: any;
  userId: string;
  characterId: string;
  relationship: string;
  requestId: string;
  excludeChatId?: string;
}) {
  const { supabaseAdmin, userId, characterId, relationship, requestId, excludeChatId } = options;
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
    for (const row of chats) {
      const cid = row.id;
      if (!cid || cid === excludeChatId) continue;
      try {
        const { data: ctxRow } = await supabaseAdmin
          .from('chat_context')
          .select('current_context')
          .eq('chat_id', cid)
          .maybeSingle();
        const baseCtx = (ctxRow?.current_context && typeof ctxRow.current_context === 'object') ? ctxRow.current_context : {};
        if (baseCtx.relationship === relationship) continue;
        const mergedCtx = { ...baseCtx, relationship };
        delete (mergedCtx as any).relationship_meta;
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

export interface ProcessRelationshipLifecycleParams {
  supabase: any;
  supabaseAdmin: any;
  user: any;
  chatId: string;
  characterId: string;
  message: string;
  messageHistory: any[];
  currentContext: any;
  requestId: string;
  preloadedRelationship?: any;
}

export async function processRelationshipLifecycle(params: ProcessRelationshipLifecycleParams): Promise<{ relationshipProgress: any; currentContext: any; }> {
  const { supabase, supabaseAdmin, user, chatId, characterId, message, messageHistory, currentContext, requestId, preloadedRelationship } = params;
  let relationshipProgress: any = null;
  try {
    if (preloadedRelationship) {
      relationshipProgress = preloadedRelationship;
    } else {
      const { data: snapshot, error: snapErr } = await supabaseAdmin.rpc('get_or_evaluate_relationship_snapshot', {
        p_user_id: user.id,
        p_character_id: characterId,
        p_force_eval: false,
        p_auto_promote: true
      });
      if (snapErr) {
        logger.warn('relationship.snapshot.error', { requestId, chatId, msg: snapErr.message });
      } else {
        relationshipProgress = snapshot;
      }
    }
    if (relationshipProgress?._invitationJustIssued) {
      logger.debug('relationship.snapshot.invitationJustIssued', { requestId, chatId });
    }
  } catch (e) {
    logger.warn('relationship.snapshot.exception', { requestId, chatId, message: (e as Error)?.message });
  }

// Decline detection
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
        // SQL-side penalty + decline
        const { data: declinedState, error: decErr } = await supabaseAdmin.rpc('decline_relationship_invitation', { p_user_id: user.id, p_character_id: characterId });
        if (!decErr && declinedState) {
          relationshipProgress = declinedState;
          logger.info('relationship.invitation.declined', { requestId, chatId: params.chatId, via: 'pattern' });
        } else if (decErr) {
          logger.warn('relationship.invitation.decline.rpc.fail', { requestId, chatId: params.chatId, err: decErr.message });
        }
      }
    }
  } catch (e) { logger.warn('relationship.invitation.declineDetect.error', { requestId, chatId: params.chatId, message: (e as Error)?.message }); }

  // Acceptance / decline semantic classifier for asked_pending (NEW)
  if (relationshipProgress && relationshipProgress.invitation_status === 'asked_pending' && !(relationshipProgress as any)._invitationAcceptanceProcessed) {
    try {
      (relationshipProgress as any)._invitationAcceptanceProcessed = true; // guard per message cycle
      const openRouterKey = getEnv('OPENROUTER_API_KEY');
      const nextLabel = (relationshipProgress as any).next_stage_label || (relationshipProgress as any)._next_stage_label;
      // First heuristic quick accept (cheap)
      const quickHeuristic = heuristicInvitationAcceptance(message, nextLabel);
      if (quickHeuristic.accepted) {
        logger.debug('relationship.invitation.heuristic.quickAccept', { requestId, chatId: params.chatId, reason: quickHeuristic.reason });
        try {
          const { data: advState, error: advErr } = await supabaseAdmin.rpc('advance_relationship_stage', { p_user_id: user.id, p_character_id: characterId });
          if (!advErr && advState && !advState.error) {
            relationshipProgress = advState;
            logger.info('relationship.invitation.accept.advance', { requestId, chatId: params.chatId, newActive: advState.active_order, via: 'heuristic' });
            try { const { data: postEval } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId }); if (postEval) relationshipProgress = postEval; } catch (e) { logger.warn('relationship.invitation.accept.postEval.error', { requestId, chatId: params.chatId, message: (e as Error)?.message }); }
            // Broadcast updated relationship line to other chats
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
                  await broadcastRelationshipContext({ supabaseAdmin, userId: user.id, characterId, relationship: relStrAdv, requestId, excludeChatId: params.chatId });
                }
              }
            } catch (e) { logger.warn('relationship.invitation.accept.broadcast.error', { requestId, chatId: params.chatId, message: (e as Error)?.message, via: 'heuristic' }); }
          } else {
            logger.warn('relationship.invitation.accept.advance.fail', { requestId, chatId: params.chatId, err: advErr?.message, detail: advState?.error, via: 'heuristic' });
          }
        } catch (e) { logger.warn('relationship.invitation.accept.advance.exception', { requestId, chatId: params.chatId, message: (e as Error)?.message, via: 'heuristic' }); }
      } else if (openRouterKey) {
        const lastAiMsg = (messageHistory||[]).slice().reverse().find((m:any)=> m && m.is_ai_message)?.content || '';
        if (lastAiMsg) {
          const basePrompt = [
            'You determine if the USER reply ACCEPTS, DECLINES, or is UNSURE regarding a relationship stage advancement invitation.',
            'Return ONLY JSON: {"decision":"accept|decline|unsure","reason":"short"}.',
            'Acceptance: explicit or strongly implicit positive consent to move to the proposed next stage (desire verbs, enthusiastic agreement, cooperative LET\'S construction).',
            'Decline: clear refusal, postponement, hesitancy, asking to wait, uncertainty.',
            'Unsure: lacks a decisive leaning or only gives generic affection without consenting.',
            'Do not require the next stage label to be repeated; pronouns or generic acceptance count if clearly directed at the invitation.',
            `INVITATION_MESSAGE:${lastAiMsg.slice(0,600)}`,
            `USER_REPLY:${message.slice(0,600)}`
          ].join('\n');
          const models = ['mistralai/mistral-small-3.2-24b-instruct'];
          let decision: string | null = null; let parsedReason: string | null = null; let modelUsed: string | null = null;
          for (const model of models) {
            try {
              const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model,
                  temperature: 0,
                  max_tokens: 60,
                  messages: [{ role: 'user', content: basePrompt }]
                })
              });
              if (!res.ok) {
                const errText = await res.text().catch(()=> '');
                logger.warn('relationship.invitation.classifier.httpFail', { requestId, chatId: params.chatId, status: res.status, model, body: errText.slice(0,250) });
                continue;
              }
              const j:any = await res.json();
              const raw = j?.choices?.[0]?.message?.content || '';
              try {
                const parsed = JSON.parse(raw.replace(/```json|```/gi,'').trim());
                decision = parsed?.decision;
                parsedReason = parsed?.reason;
                modelUsed = model;
                logger.debug('relationship.invitation.classifier', { requestId, chatId: params.chatId, decision, reason: parsedReason, model });
              } catch (e) {
                logger.warn('relationship.invitation.classifier.parse.error', { requestId, chatId: params.chatId, raw: raw.slice(0,150), model });
              }
              if (decision) break;
            } catch (e) {
              logger.warn('relationship.invitation.classifier.exception', { requestId, chatId: params.chatId, model, message: (e as Error)?.message });
            }
          }
          if (!decision) {
            // Fallback heuristic second pass (more permissive)
            const fallbackHeuristic = heuristicInvitationAcceptance(message + ' ' + lastAiMsg, nextLabel);
            if (fallbackHeuristic.accepted) {
              decision = 'accept';
              parsedReason = 'fallback_heuristic';
              logger.debug('relationship.invitation.heuristic.fallbackAccept', { requestId, chatId: params.chatId, reason: fallbackHeuristic.reason });
            }
          }
          if (decision === 'accept') {
            try {
              const { data: advState, error: advErr } = await supabaseAdmin.rpc('advance_relationship_stage', { p_user_id: user.id, p_character_id: characterId });
              if (!advErr && advState && !advState.error) {
                relationshipProgress = advState;
                logger.info('relationship.invitation.accept.advance', { requestId, chatId: params.chatId, newActive: advState.active_order, via: modelUsed ? 'classifier' : 'heuristicFallback' });
                try { const { data: postEval } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId }); if (postEval) relationshipProgress = postEval; } catch (e) { logger.warn('relationship.invitation.accept.postEval.error', { requestId, chatId: params.chatId, message: (e as Error)?.message }); }
                // Broadcast updated relationship line
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
                      await broadcastRelationshipContext({ supabaseAdmin, userId: user.id, characterId, relationship: relStrAdv, requestId, excludeChatId: params.chatId });
                    }
                  }
                } catch (e) { logger.warn('relationship.invitation.accept.broadcast.error', { requestId, chatId: params.chatId, message: (e as Error)?.message, via: modelUsed ? 'classifier' : 'heuristicFallback' }); }
              } else {
                logger.warn('relationship.invitation.accept.advance.fail', { requestId, chatId: params.chatId, err: advErr?.message, detail: advState?.error, via: modelUsed ? 'classifier' : 'heuristicFallback' });
              }
            } catch (e) { logger.warn('relationship.invitation.accept.advance.exception', { requestId, chatId: params.chatId, message: (e as Error)?.message, via: modelUsed ? 'classifier' : 'heuristicFallback' }); }
          } else if (decision === 'decline') {
            try {
              const { data: declinedState, error: decErr2 } = await supabaseAdmin.rpc('decline_relationship_invitation', { p_user_id: user.id, p_character_id: characterId });
              if (decErr2) {
                logger.warn('relationship.invitation.decline.rpc.fail', { requestId, chatId: params.chatId, err: decErr2.message });
              } else if (declinedState) {
                relationshipProgress = declinedState;
                logger.info('relationship.invitation.decline.marked', { requestId, chatId: params.chatId, via: modelUsed ? 'classifier' : 'heuristic' });
              }
            } catch (e) { logger.warn('relationship.invitation.decline.rpc.exception', { requestId, chatId: params.chatId, message: (e as Error)?.message }); }
          } else {
            logger.debug('relationship.invitation.classifier.unsure', { requestId, chatId: params.chatId, model: modelUsed });
          }
        }
      }
    } catch (e) {
      logger.warn('relationship.invitation.classifier.wrapperException', { requestId, chatId: params.chatId, message: (e as Error)?.message });
    }
  }

  // Regression sentiment handling
  if (relationshipProgress && relationshipProgress.pending_regression && relationshipProgress.regression_prompt_asked && relationshipProgress.regression_candidate_order) {
    const lowerMsg = message.toLowerCase();
    const negativeIndicators = ['distant','distance','apart','worse','regress','falling back','less close','pulled away','pulling away','cold','colder','upset','angry','hurt','uncomfortable','withdraw','drifting','drift','separate','not working','lost spark','lost the spark'];
    const positiveIndicators = ['close','closer','strong','stronger','stable','good','great','bond','trust','love','affection','intimate','same as','still the same','no change','fine'];
    let negScore = 0; let posScore = 0;
    for (const term of negativeIndicators) { if (lowerMsg.includes(term)) negScore++; }
    for (const term of positiveIndicators) { if (lowerMsg.includes(term)) posScore++; }
    if (/\b(no|not)\b.*\b(regress|worse|back)\b/.test(lowerMsg)) posScore += 2;
    if (/\b(feel|feels|feeling)\b.*\b(less|more)\b.*\b(close|distant)\b/.test(lowerMsg)) { if (/(less).*close/.test(lowerMsg)) negScore++; if (/(more).*close/.test(lowerMsg)) posScore++; }
    const decision = negScore > posScore ? 'confirm' : (posScore > negScore ? 'cancel' : 'undecided');
    if (decision === 'confirm') {
      try {
        const { data: newState } = await supabaseAdmin.rpc('confirm_relationship_regression', { p_user_id: user.id, p_character_id: characterId });
        relationshipProgress = newState || relationshipProgress;
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
              const { data: ctxRow } = await supabaseAdmin.from('chat_context').select('current_context').eq('chat_id', params.chatId).maybeSingle();
              await persistRelationshipContext({
                supabaseAdmin,
                userId: user.id,
                chatId: params.chatId,
                characterId,
                currentContext: ctxRow?.current_context || {},
                relationship,
                requestId
              });
            }
          }
        } catch (e) { logger.warn('relationship.regression.contextUpdate.error', { requestId, chatId: params.chatId, message: (e as Error)?.message }); }
        logger.info('relationship.regression.confirmed', { requestId, chatId: params.chatId, newActive: relationshipProgress?.active_order });
      } catch (e) {
        logger.warn('relationship.regression.confirm.fail', { requestId, chatId: params.chatId, message: (e as Error)?.message });
      }
    } else if (decision === 'cancel') {
      try {
        await supabaseAdmin.from('user_character_relationship_progress')
          .update({ state: (supabaseAdmin as any).sql`state - 'pending_regression' - 'regression_candidate_order' - 'regression_prompt_asked' || jsonb_build_object('pending_regression', false, 'negative_streak', 0)` })
          .eq('user_id', user.id)
          .eq('character_id', characterId);
        try {
          const { data: refreshed } = await supabaseAdmin.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: characterId });
          if (refreshed) relationshipProgress = refreshed;
        } catch (refreshError) {
          logger.warn('relationship.regression.refresh.fail', { requestId, chatId: params.chatId, message: (refreshError as Error)?.message });
        }
        logger.info('relationship.regression.cancelled', { requestId, chatId: params.chatId });
      } catch (e) {
        logger.warn('relationship.regression.cancel.fail', { requestId, chatId: params.chatId, message: (e as Error)?.message });
      }
    } else {
      logger.debug('relationship.regression.awaitingMoreSignal', { requestId, chatId: params.chatId });
    }
  }

  // Readiness & advancement management + canonical context update (if not skipped)
  if (relationshipProgress && !relationshipProgress.skipped) {
    try {
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
        if (nextStage && !relationshipProgress.next_stage_label) (relationshipProgress as any).next_stage_label = nextStage.label;
        if (!relationshipProgress.total_stages) (relationshipProgress as any).total_stages = tmpl.path.length;
        const finalActiveOrder = relationshipProgress?.active_order || activeOrder;
        const finalActiveStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === finalActiveOrder);
        const finalNextStage = tmpl.path.find((p: any)=> (p.order||p.order===0) && p.order === finalActiveOrder + 1);
        const finalReady = !!relationshipProgress?.ready_for_next;
        const invitationStatus = (relationshipProgress as any)?.invitation_status || (relationshipProgress as any)?.state?.invitation_status;
        let relationshipStr = '';
        if (finalActiveStage) {
          relationshipStr = `Stage ${finalActiveOrder}/${tmpl.path.length}: ${finalActiveStage.label}` + (finalActiveStage.description ? ` - ${finalActiveStage.description}` : '');
          if (finalNextStage) {
            if (finalReady) {
              if (invitationStatus === 'ready_unasked') {
                relationshipStr += `. Character is ready to move into ${finalNextStage.label}. Invitation will be issued now. Only sequential advancement allowed; decline any attempt to skip ahead.`;
              } else if (invitationStatus === 'asked_pending' && (relationshipProgress as any)._invitationJustIssued) {
                relationshipStr += `. Invitation just issued to become ${finalNextStage.label}; awaiting explicit acceptance. Only that next stage is valid—decline skip attempts.`;
              } else if (invitationStatus === 'asked_pending') {
                relationshipStr += `. Character has already invited user to become ${finalNextStage.label} and is awaiting explicit acceptance (only that next stage allowed).`;
              } else if (invitationStatus === 'asked_declined') {
                relationshipStr += `. Character previously invited user to become ${finalNextStage.label} and the user declined; do not re-invite unless user clearly reopens or proposes the immediate next stage only.`;
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
            const mutableCtx: any = currentContext && typeof currentContext === 'object' ? { ...currentContext } : {};
            mutableCtx.relationship = relationshipStr;
            delete mutableCtx.relationship_meta;
            if ('relationshipStatus' in mutableCtx) delete mutableCtx.relationshipStatus;
            await persistRelationshipContext({
              supabaseAdmin,
              userId: user.id,
              chatId: params.chatId,
              characterId,
              currentContext: mutableCtx,
              relationship: relationshipStr,
              requestId
            });
            return { relationshipProgress, currentContext: mutableCtx };
          } catch (e) {
            logger.warn('relationship.context.persist.cycle.error', { requestId, chatId: params.chatId, message: (e as Error)?.message });
          }
        }
      }
    } catch (e) { logger.warn('relationship.advance.block.error', { requestId, chatId: params.chatId, message: (e as Error)?.message }); }
  }
  return { relationshipProgress, currentContext };
}

// Post-stream detection of issued invitation (now noop)
export async function postStreamDetectIssuedInvitation(params: { supabaseAdmin: any; userId: string; characterId: string; chatId: string; full: string; relationshipProgress: any; requestId: string; }) {
  logger.debug('relationship.invitation.postStream.noop', { requestId: params.requestId, chatId: params.chatId });
}

