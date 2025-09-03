// Optimized Extract Addon Context Edge Function (v3)
// Single-pass, explicit user/AI exchange, minimal fetch, phase timings.

import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { withRateLimit, enforceJsonBodySize } from '../_shared/rate-limit.ts';
import { saveContextUpdates } from './modules/context-extractor.ts';
import { fetchCharacterData, getCharacterForContext, fetchUserData, createTemplateReplacer } from './modules/character-fetcher.ts';
import { generateEnhancedGreeting, updateMessageWithGreeting } from './modules/greeting-enhancer.ts';
import { anyAddonEnabled, sanitizeAddonSettings } from '../_shared/settings-mapper.ts';

declare const Deno: any;

interface PhaseTimings { [k: string]: number }

function ms(start: number) { return Math.round(performance.now() - start); }
function logPhase(id: string, phase: string, start: number, extra: Record<string, unknown> = {}) {
  console.log(`⏱️ [${id}] ${phase} ${ms(start)}ms${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
}

function buildPrompt(opts: {
  character: any;
  prior: Record<string,string>|null;
  enabled: string[];
  userMessage: string;
  aiResponse: string;
  greetingUsed?: string|null;
}) {
  const { character, prior, enabled, userMessage, aiResponse, greetingUsed } = opts;
  const firstExtraction = !prior || Object.keys(prior).length === 0;
  const seedParts = [
    character?.name,
    character?.personality_summary,
    character?.description,
    character?.scenario,
    character?.greeting
  ].filter(Boolean);
  const seedRaw = seedParts.join(' ').replace(/\s+/g,' ');
  const seed = firstExtraction ? seedRaw.slice(0, 800) : seedRaw.slice(0, 400);
  const priorFiltered = prior ? Object.fromEntries(Object.entries(prior).filter(([k]) => enabled.includes(k))) : {};
  const lines: string[] = [];
  lines.push('You output ONLY minified JSON. No markdown fences.');
  lines.push(`EnabledFields:${enabled.join(',')}`);
  if (firstExtraction) {
    lines.push('MODE:FIRST_EXTRACTION');
    if (character?.description) lines.push(`Description:${String(character.description).slice(0,600)}`);
    if (character?.scenario) lines.push(`Scenario:${(typeof character.scenario==='string'?character.scenario:JSON.stringify(character.scenario)).slice(0,600)}`);
    if (greetingUsed) lines.push(`GreetingUsed:${greetingUsed.slice(0,600)}`);
  }
  if (seed) lines.push(`Seed:${seed}`);
  lines.push(`Prior:${JSON.stringify(priorFiltered)}`);
  lines.push(`User:${userMessage.slice(0,800)}`);
  lines.push(`AI:${aiResponse.slice(0,800)}`);
  lines.push('TASK: Decide which enabled fields have a NEW value (different from Prior ignoring case/spacing) that is supported by the latest user/AI exchange OR (first extraction) can be confidently inferred from seed/messages.');
  lines.push('OUTPUT RULES:');
  lines.push('- Return ONLY those fields that truly change. Omit unchanged or unknown fields entirely.');
  lines.push('- For each included field output: "field_name":{"value":string,"changed":true,"reason":one_of[explicit_user,user_request,environment_shift,narrative_followup,ai_spontaneous]}.');
  lines.push('- Do NOT output fields with no evidence, speculative guesses, or values identical to Prior (case-insensitive).');
  lines.push('- If a field would be "No context" / unknown -> OMIT it.');
  lines.push('- If nothing changes return {}.');
  lines.push('- Keep value concise (≤8 words), no conjunction chains.');
  lines.push('Return ONLY minified JSON object (no prose, no markdown).');
  return lines.join('\n');
}

function parseModelJSON(raw: string|null, allowed: string[]) {
  if (!raw) return null;
  raw = raw.replace(/```json|```/gi,'').trim();
  let obj: any; try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const out: Record<string,string> = {};
  for (const k of allowed) {
    const v = obj[k];
    if (v && typeof v === 'object' && typeof v.value === 'string') out[k] = v.value.trim() || 'No context';
    else if (typeof v === 'string') out[k] = v.trim() || 'No context';
  }
  return Object.keys(out).length ? out : null;
}

async function callModel(prompt: string, signal: AbortSignal): Promise<string|null> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
      'X-Title': 'AnimaChat-Context-v3'
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-small-3.2-24b-instruct',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      top_p: 0.1,
      max_tokens: 250
    }),
    signal
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const choices = json?.choices; if (!Array.isArray(choices) || !choices[0]) return null;
  const content = choices[0]?.message?.content;
  return typeof content === 'string' ? content : null;
}

// Relationship signal heuristic
function deriveRelationshipSignals(userMsg: string): Array<{ kind: string; weight: number; polarity: 1 | -1 }> {
  const signals: Array<{ kind: string; weight: number; polarity: 1 | -1 }> = [];
  const m = userMsg.toLowerCase();
  const pos: Array<[RegExp,string,number]> = [
    [/\b(i love you|love you|i care about you|i adore you|marry|engage|commit)\b/i,'commitment',0.25],
    [/\b(i (really )?like you|affection|hug|kiss|cuddle)\b/i,'affection',0.15],
    [/\b(intimate|together forever|soulmate)\b/i,'intimacy',0.2]
  ];
  const neg: Array<[RegExp,string,number]> = [
    [/\b(distance|need space|back off|cool down)\b/i,'distancing',0.18],
    [/\b(not working|break up|separate|end this)\b/i,'breakup',0.4],
    [/\b(i (don'?t|no longer) love you|stop this)\b/i,'rejection',0.25]
  ];
  for (const [r,k,w] of pos) { if (r.test(userMsg)) signals.push({ kind: k, weight: w, polarity: 1 }); }
  for (const [r,k,w] of neg) { if (r.test(userMsg)) signals.push({ kind: k, weight: w, polarity: -1 }); }
  return signals;
}

// Build canonical relationship status string
function buildCanonicalRelationship(template: any, progress: any): { display: string|null; meta: any } {
  if (!template || !template.enabled || !Array.isArray(template.path) || !progress) return { display: null, meta: null };
  const active = progress.active_order || progress.activeOrder || 1;
  const total = template.path.length; // still used in meta
  const goal = template.path.find((g: any)=> (g.order === active));
  if (!goal) return { display: null, meta: null };
  const base = goal.label || null; // label only (remove "Stage x/x:" prefix and description)
  if (!base) return { display: null, meta: null };
  // Compute next threshold % (unchanged)
  let nextThreshold: number|null = null;
  const nextGoal = template.path.find((g:any)=> g.order === active+1);
  if (nextGoal) nextThreshold = nextGoal.threshold;
  const currentScore = Number(progress.current_score ?? 0);
  const percentToNext = nextThreshold ? Math.max(0, Math.min(1, currentScore / nextThreshold)) : null;
  return { display: base, meta: { active_order: active, total_stages: total, current_score: currentScore, next_threshold: nextThreshold, percent_to_next: percentToNext, pending_regression: !!progress.pending_regression, regression_candidate_order: progress.regression_candidate_order ?? null } };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('📋 CORS preflight request received');
    return createCorsResponse();
  }
  // Test endpoint for debugging
  if (req.url.includes('test')) {
    return createCorsResponse({ message: 'extract-addon-context v3 ok', ts: new Date().toISOString() });
  }
  const tStart = performance.now();
  const requestId = crypto.randomUUID();
  console.log(`🔍 [${requestId}] extract-addon-context v3 start`);
  try {
    // AUTH
    const authStart = performance.now();
    const { user, supabase, supabaseAdmin } = await authenticateUser(req);
    logPhase(requestId, 'auth', authStart, { user: user.id });
    const rateLimited = await withRateLimit(req, user.id, async () => true);
    if (!rateLimited) return createErrorResponse('Rate limit', 429);

    // BODY
    const parseStart = performance.now();
    const sizeResp = await enforceJsonBodySize(req); if (sizeResp) return sizeResp;
    let body: any; try { body = await req.json(); } catch { return createErrorResponse('Invalid JSON body', 400); }
    const chat_id = typeof body.chat_id === 'string' ? body.chat_id : '';
    const character_id = typeof body.character_id === 'string' ? body.character_id : '';
    const mode = body.mode === 'conversation' ? 'conversation' : 'initial';
    const userMsg = typeof body.user_message === 'string' ? body.user_message : '';
    const aiMsg = typeof body.ai_response === 'string' ? body.ai_response : '';
    const injectedInitialContext = (body.initial_context && typeof body.initial_context === 'object') ? body.initial_context : null; // NEW
    const normalizedAddonSettings = sanitizeAddonSettings(body.addon_settings || {});
    logPhase(requestId, 'parse', parseStart, { mode });
    if (!chat_id || !character_id) return createErrorResponse('Missing chat_id or character_id', 400);
    if (mode === 'conversation' && (!userMsg || !aiMsg)) return createErrorResponse('Must include user_message and ai_response for conversation mode', 400);

    // EARLY EXIT
    if (!anyAddonEnabled(normalizedAddonSettings) || !Deno.env.get('OPENROUTER_API_KEY')) {
      return createCorsResponse({ success: true, chat_id, message: 'No addons enabled or missing key', context_summary: null, timings: { totalMs: ms(tStart) } });
    }

    // FETCH character + prior context
    const fetchStart = performance.now();
    const [character, priorCtxRow] = await Promise.all([
      fetchCharacterData(character_id, supabase, { full: false }),
      // Replaced direct table query with existing RPC get_chat_context to enforce RLS via auth.uid()
      supabase.rpc('get_chat_context', { p_chat_id: chat_id, p_user_id: user.id, p_character_id: character_id })
    ]);
    let priorContext = Array.isArray(priorCtxRow?.data) && priorCtxRow.data[0]?.current_context ? priorCtxRow.data[0].current_context : null;

    // Relationship template & progress (initialize lazily)
    let relationshipTemplate: any = null;
    let relationshipProgress: any = null;
    let canonicalRelationship: string | null = null;
    let relationshipMeta: any = null;
    try {
      const tmplResp = await supabase.from('character_latent_profiles').select('relationship_goals').eq('character_id', character_id).maybeSingle();
      relationshipTemplate = tmplResp.data?.relationship_goals || null;
      const templateEnabled = !!relationshipTemplate?.enabled;
      if (templateEnabled) {
        // Defer evaluation slightly to allow chat creation + context sync to settle
        try {
          await new Promise(r => setTimeout(r, 300));
          const evalResp = await supabase.rpc('evaluate_relationship_progress', { p_user_id: user.id, p_character_id: character_id });
          relationshipProgress = evalResp.data || null;
        } catch (e) { console.warn('rel.eval.fail', e); }
        const built = buildCanonicalRelationship(relationshipTemplate, relationshipProgress);
        canonicalRelationship = built.display;
        relationshipMeta = built.meta;
      }
    } catch (e) { console.warn('rel.template.load.fail', e); }

    // If canonical relationship present, ensure priorContext overridden (or seeded)
    if (canonicalRelationship) {
      if (!priorContext || typeof priorContext !== 'object') {
        priorContext = {} as any; // ensure mutable object for downstream usage
      }
      (priorContext as any).relationship = canonicalRelationship;
    }

    // Determine if relationship field should be extracted via model (template disabled + user addon enabled)
    const templateEnabled = !!relationshipTemplate?.enabled;
    const addonRelEnabled = !!normalizedAddonSettings.relationshipStatus;

    // If canonical template is active we force addon considered active for persistence decisions
    const effectiveRelationshipCanonical = templateEnabled && canonicalRelationship;

    // INITIAL MODE: Persist greeting + optionally canonical relationship then exit early (no model extraction)
    if (mode === 'initial') {
      if (canonicalRelationship) {
        try {
          const baseObj = (priorContext && typeof priorContext === 'object') ? priorContext : {};
          await supabaseAdmin.from('chat_context').upsert({
            user_id: user.id,
            chat_id,
            character_id,
            current_context: { ...baseObj, relationship: canonicalRelationship }
          }, { onConflict: 'chat_id' });
        } catch (e) { console.warn('rel.initial.persist.fail', e); }
      }
      return createCorsResponse({ success: true, chat_id, message: 'Greeting updated (initial stage persisted)', relationship_status: canonicalRelationship, relationship_progress: relationshipProgress || relationshipMeta, context_summary: null, timings: { totalMs: ms(tStart) } });
    }

    // Early exit condition now only applies if no model fields AND no canonical relationship
    // Recompute enabled fields later; cannot early exit yet.

    let greetingUsed: string | null = null;
    let templateReplacer: ((s:string)=>string) | null = null;
    if (!priorContext) {
      const userData = await fetchUserData(user.id, supabase);
      templateReplacer = createTemplateReplacer(userData.persona, userData.profile, character || {});
      try {
        const { data: greetMsg } = await supabase
          .from('messages')
          .select('content')
          .eq('chat_id', chat_id)
          .eq('is_ai_message', true)
          .eq('message_order', 1)
          .maybeSingle();
        greetingUsed = (greetMsg?.content && typeof greetMsg.content === 'string') ? greetMsg.content : null;
      } catch {}
    }
    logPhase(requestId, 'fetch', fetchStart, { hasCharacter: !!character, prior: !!priorContext, greetIncluded: !!greetingUsed });

    // DETERMINE enabled fields (skip those already present via injected initial context)
    const skipFields = new Set<string>();
    if (injectedInitialContext) {
      for (const k of Object.keys(injectedInitialContext)) {
        if (injectedInitialContext[k] && typeof injectedInitialContext[k] === 'string') {
          skipFields.add(k);
        }
      }
    }
    const fieldMap: Record<string,string> = {
      moodTracking: 'mood',
      clothingInventory: 'clothing',
      locationTracking: 'location',
      timeAndWeather: 'time_weather',
      characterPosition: 'character_position',
      timeAwareness: 'conversation_tone'
    };
    if (!templateEnabled && addonRelEnabled) {
      fieldMap.relationshipStatus = 'relationship';
    }
    const enabledFields: string[] = [];
    if (normalizedAddonSettings.moodTracking && !skipFields.has('mood')) enabledFields.push('mood');
    if (normalizedAddonSettings.clothingInventory && !skipFields.has('clothing')) enabledFields.push('clothing');
    if (normalizedAddonSettings.locationTracking && !skipFields.has('location')) enabledFields.push('location');
    if (normalizedAddonSettings.timeAndWeather && !skipFields.has('time_weather')) enabledFields.push('time_weather');
    if (!templateEnabled && addonRelEnabled && !skipFields.has('relationship')) enabledFields.push('relationship');
    if (normalizedAddonSettings.characterPosition && !skipFields.has('character_position')) enabledFields.push('character_position');
    if (normalizedAddonSettings.timeAwareness) { enabledFields.push('conversation_tone', 'urgency_level'); }

    const anyModelFields = enabledFields.length > 0;
    if (!anyModelFields && !effectiveRelationshipCanonical) {
      return createCorsResponse({ success: true, chat_id, message: 'No enabled extractable fields', context_summary: null, relationship_status: canonicalRelationship, relationship_progress: relationshipMeta, timings: { totalMs: ms(tStart) } });
    }

    // PROMPT
    let parsed: any = null;
    if (anyModelFields) {
      const promptStart = performance.now();
      let prompt = buildPrompt({
        character: getCharacterForContext(character),
        prior: priorContext as Record<string,string> | null,
        enabled: enabledFields,
        userMessage: templateReplacer ? templateReplacer(userMsg) : userMsg,
        aiResponse: templateReplacer ? templateReplacer(aiMsg) : aiMsg,
        greetingUsed: templateReplacer && greetingUsed ? templateReplacer(greetingUsed) : greetingUsed
      });
      if (enabledFields.includes('relationship')) {
        prompt += '\nRELATIONSHIP FIELD RULES: Output ≤3 words summarizing relationship (e.g., "casual friends", "close allies"). Do NOT speculate; omit if unclear.';
      }
      logPhase(requestId, 'prompt', promptStart, { est_tokens: Math.ceil(prompt.length/4) });
      const modelStart = performance.now();
      const controller = new AbortController();
      const to = setTimeout(()=>controller.abort(), 20000);
      let raw = null;
      try { raw = await callModel(prompt, controller.signal); } catch (e) { console.warn(`[${requestId}] model error`, e); }
      clearTimeout(to);
      logPhase(requestId, 'model', modelStart, { got: !!raw });
      const parse2Start = performance.now();
      parsed = parseModelJSON(raw, enabledFields);
      logPhase(requestId, 'parse-json', parse2Start, { parsed: !!parsed });
    }

    // PERSIST
    const persistStart = performance.now();
    if (parsed || canonicalRelationship) {
      const toPersist: any = parsed ? { ...parsed } : {};
      if (canonicalRelationship) toPersist.relationship = canonicalRelationship;
      const allNo = Object.values(toPersist).every((v: any) => v === 'No context');
      await saveContextUpdates(toPersist, normalizedAddonSettings, user.id, chat_id, character_id, supabaseAdmin, { forcePersist: allNo || !priorContext });
    }
    logPhase(requestId, 'persist', persistStart, { persisted: !!(parsed || canonicalRelationship) });

    const totalMs = ms(tStart);
    console.log(`✅ [${requestId}] complete ${totalMs}ms`);
    return createCorsResponse({ success: true, chat_id, message: 'Context processed', context_summary: parsed || null, relationship_status: canonicalRelationship, relationship_progress: relationshipMeta, timings: { totalMs } });
  } catch (error) {
    console.error(`❌ [${requestId}] failure:`, error);
    return createCorsResponse({ success: false, chat_id: '', message: 'Context extraction failed', error: (error as any)?.message || String(error) }, 500);
  }
});
