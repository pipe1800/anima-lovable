// Supabase Edge Function: extract-latent-profile
// Secure internal extraction of latent character traits.
// POST { character_id } -> triggers model call (external API) if no up-to-date profile exists.
// Rate-limited & requires authenticated user who owns the character OR service role.
import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { withRateLimit } from '../_shared/rate-limit.ts';
import { validateLatentProfile } from '../_shared/latent-profile-validator.ts';
import { getEnv } from '../_shared/env.ts';
const EXTRACTION_VERSION = 'v2-debug2'; // updated after prompt key alignment
const MAX_REGEN_PER_DAY = 3; // per character per 24h
const MIN_SAVE_POPULATED_DOMAINS = 1; // lowered threshold (TEMP DEBUG)
const TARGET_DOMAINS_FOR_RETRY = 5; // only retry if below this AND below save threshold override
async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map((b)=>b.toString(16).padStart(2, '0')).join('');
}
// Fetch using the consolidated view to avoid duplicating complex joins present in src/data.
// We cannot import frontend code here, so we rely on the DB view as single source of truth.
async function fetchCharacterBundle(supabaseAdmin, characterId, userId) {
  console.log('latent.fetch.start', {
    characterId
  });
  // First attempt: consolidated view
  let viewError = null;
  let viewData = null;
  const { data, error } = await supabaseAdmin.from('character_profile_view').select('id, creator_id, name, tagline, short_description, character_definitions, tags, world_infos').eq('id', characterId).maybeSingle();
  viewData = data;
  viewError = error;
  // If view relation missing or other error, fallback to direct base tables
  if (viewError && (viewError.code === '42P01' || /relation .*character_profile_view/i.test(viewError.message))) {
    console.warn('latent.fetch.view_missing_fallback', {
      code: viewError.code
    });
  }
  if (viewError && (viewError.code === '42P01' || /relation .*character_profile_view/i.test(viewError.message)) || !viewError && !viewData) {
    const { data: direct, error: directErr } = await supabaseAdmin.from('characters').select(`id, creator_id, name, tagline, short_description, character_definitions:character_definitions(description, personality_summary, greeting, scenario, initial_addon_context_enabled, initial_addon_context)`) // minimal fields required
    .eq('id', characterId).maybeSingle();
    if (directErr) {
      console.error('latent.fetch.direct_failed', {
        code: directErr.code,
        message: directErr.message
      });
      return {
        error: 'not_found'
      };
    }
    viewData = {
      ...direct,
      tags: [],
      world_infos: []
    };
  }
  if (!viewData) {
    console.warn('latent.fetch.no_data', {
      characterId
    });
    return {
      error: 'not_found'
    };
  }
  if (viewData.creator_id !== userId) {
    console.warn('latent.fetch.forbidden', {
      characterId,
      owner: viewData.creator_id,
      requester: userId
    });
    return {
      error: 'forbidden'
    };
  }
  console.log('latent.fetch.success', {
    characterId
  });
  return {
    data: viewData
  };
}
async function countRecentRegens(supabaseAdmin, characterId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin.from('character_latent_profile_history').select('id', {
    count: 'exact',
    head: true
  }).eq('character_id', characterId).gte('created_at', since);
  if (error) return 0;
  return count || 0;
}
async function alreadyFresh(supabaseAdmin, characterId, sourceHash) {
  const { data } = await supabaseAdmin.from('character_latent_profiles').select('source_card_hash, extraction_version').eq('character_id', characterId).maybeSingle();
  if (!data) return false;
  return data.source_card_hash === sourceHash && data.extraction_version === EXTRACTION_VERSION;
}
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}
function sanitize(text) {
  if (!text) return '';
  return text.replace(/[`]{3,}/g, '').replace(/\b(\d{1,2}\s?(?:years? old|yo))\b/gi, '[REDACTED_EXPLICIT_TRAIT]').replace(/\b(male|female|gender|ethnicity|race)\b/gi, '[REDACTED_EXPLICIT_TRAIT]').trim();
}
function flattenScenario(scenario) {
  if (!scenario || typeof scenario !== 'object') return undefined;
  const flat = {};
  for (const [k, v] of Object.entries(scenario)){
    if (v == null) continue;
    const val = typeof v === 'string' ? v : JSON.stringify(v).slice(0, 600);
    if (val.trim()) flat[k] = truncate(val.replace(/\s+/g, ' ').trim(), 800);
  }
  return Object.keys(flat).length ? flat : undefined;
}
function buildCanonicalSource(raw) {
  const defs = raw.character_definitions || {};
  const personality_summary = sanitize(defs.personality_summary || '');
  const description = sanitize(defs.description || '');
  const greeting = sanitize(defs.greeting || '');
  const scenario = flattenScenario(defs.scenario);
  const addonCtx = defs.initial_addon_context_enabled ? defs.initial_addon_context : null;
  const addon_context = addonCtx ? sanitize(JSON.stringify(addonCtx)) : undefined;
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t)=>t.name).slice(0, 12) : [];
  const world_info_refs = Array.isArray(raw.world_infos) ? raw.world_infos.map((w)=>w.name).slice(0, 5) : [];
  return {
    meta: {
      character_id: raw.id,
      name: raw.name,
      tagline: raw.tagline || undefined,
      short_description: raw.short_description || undefined,
      tags,
      world_info_refs: world_info_refs.length ? world_info_refs : undefined
    },
    text_sections: {
      personality_summary: truncate(personality_summary, 2000) || undefined,
      description: truncate(description, 4000) || undefined,
      greeting: truncate(greeting, 600) || undefined,
      scenario: scenario,
      addon_context: addon_context
    }
  };
}
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k)=>JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
function buildPrompt(canonical) {
  const canonicalJson = stableStringify(canonical);
  // Updated schema including sexuality & preference fields (open text arrays for kinks/turn_ons/turn_offs/fetishes)
  const schemaSpec = '{"drives":{"motive_core":string|null,"hidden_agenda":string|null,"fear_anchor":string|null},"values_framework":{"value_stack":string[] (2-3),"moral_flex_point":string|null},"internal_conflict":{"tension_axis":"X vs Y"|null,"resolution_pull":string|null},"worldview_profile":{"risk_level":"very_low|low|med|high|very_high"|null,"authority_posture":"defer|challenge|subvert|ignore"|null,"time_focus":"past|present|future|multi"|null,"worldview_note":string|null},"relational_style":{"trust_ramp":"fast|cautious|guarded|transactional"|null,"attachment_flavor":"secure|avoidant|anxious|mixed"|null,"role_self_frame":"caretaker|mentor|disruptor|outsider|strategist|observer"|null,"orientation":"heterosexual|homosexual|bisexual|pansexual|asexual|demisexual|queer|questioning|unspecified"|null,"intimacy_drive":"low|moderate|high"|null,"flirting_style":"direct|playful|teasing|reserved|intellectual|subtle"|null,"boundary_note":string|null,"kinks":string[] (0-8)|null,"turn_ons":string[] (0-8)|null,"turn_offs":string[] (0-8)|null,"fetishes":string[] (0-8)|null},"cog_emotional_style":{"thinking_mode":"analytical|intuitive|heuristic|methodical"|null,"emotional_regulation":"stable|bursty|suppressed|volatile"|null,"escalation_trigger":string|null},"communication_texture":{"verbosity":"laconic|balanced|expansive"|null,"pacing":"rapid|measured|contemplative"|null,"humor_style":"none|dry|sardonic|absurd|dark|punny|wry"|null,"signature_discourse":string|null},"aesthetic_bias":{"palette":"minimalist|ornate|gothic|pastoral|neon|naturalistic|utilitarian|elegant"|null,"modesty_to_flaunt":0-4|null,"practicality_bias":0-4|null},"constraint_and_secret":{"limiting_factor":string|null,"hidden_soft_spot":string|null},"growth_arc_anchor":{"growth_vector":string|null,"resistance_factor":string|null},"memory_schema":{"defining_memory_type":"loss|betrayal|triumph|mentorship|failure|creation"|null,"schema_bias":"betrayal|opportunity|decay|order|providence"|null},"meta_control":{"confidence_avg":0-1}}';
  return `SYSTEM: Output ONLY minified JSON with EXACT keys. Arrays must be lower-case short phrases. Null if unknown. Avoid explicit real-world demographics.\nSCHEMA:${schemaSpec}\nSOURCE:${canonicalJson}\nTASK: JSON only.`.slice(0, 14000);
}
async function callModel(fullPrompt) {
  const openRouterKey = getEnv('OPENROUTER_API_KEY', {
    required: true
  });
  const model = 'mistralai/mistral-small-3.2-24b-instruct';
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 850,
      messages: [
        {
          role: 'system',
          content: 'Return ONLY valid minified JSON.'
        },
        {
          role: 'user',
          content: fullPrompt
        }
      ]
    })
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(()=>resp.statusText);
    throw new Error(`model_error:${resp.status}:${detail.slice(0, 160)}`);
  }
  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content || '';
  return content;
}
function extractJson(raw) {
  if (!raw) return {};
  const cleaned = raw.replace(/```json|```/gi, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return {};
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch  {
    return {};
  }
}
function heuristicFallback(canonical) {
  const text = JSON.stringify(canonical.text_sections).toLowerCase();
  function has(...keys) {
    return keys.some((k)=>text.includes(k));
  }
  const profile = {
    drives: {
      primary: null,
      secondary: null,
      tertiary: null
    },
    values_framework: {
      core_values: [],
      anti_values: [],
      moral_orientation: null
    },
    internal_conflict: {
      tension_axis: null,
      fear: null,
      shame_trigger: null
    },
    worldview_profile: {
      optimism_pessimism: null,
      locus_of_control: null,
      cynicism_level: null
    },
    relational_style: {
      attachment_flavor: null,
      trust_threshold: null,
      dominant_interpersonal_strategy: null
    },
    cog_emotional_style: {
      processing_mode: null,
      emotional_regulation: null,
      stress_response: null
    },
    communication_texture: {
      voice_register: null,
      cadence: null,
      signature_discourse_moves: []
    },
    aesthetic_bias: {
      sensory_preferences: [],
      symbolic_motifs: []
    },
    constraint_and_secret: {
      operational_constraints: [],
      guarded_secret: null
    },
    growth_arc_anchor: {
      latent_potential: null,
      core_wound: null,
      transformational_hook: null
    },
    memory_schema: {
      anchoring_experiences: [],
      recurring_cues: []
    },
    meta_control: {
      self_override_triggers: [],
      stability_risk_factors: []
    },
    _meta: {
      confidence_avg: 0.35,
      populated_domains: []
    }
  };
  // Basic mappings
  if (has('revenge', 'venge')) profile.drives.primary = 'retribution';
  else if (has('justice')) profile.drives.primary = 'justice restoration';
  else if (has('wander', 'explor', 'discover')) profile.drives.primary = 'curiosity-driven exploration';
  else if (has('protect', 'guardian')) profile.drives.primary = 'protective guardianship';
  if (has('sarcastic', 'wry', 'dry')) profile.communication_texture.voice_register = 'dry sardonic';
  if (has('methodical', 'calculating', 'strategic')) profile.cog_emotional_style.processing_mode = 'analytical';
  if (!profile.cog_emotional_style.processing_mode && has('impulsive', 'rash', 'instinct')) profile.cog_emotional_style.processing_mode = 'intuitive';
  if (has('haunted', 'guilt', 'regret')) profile.internal_conflict.fear = 'repeating past failure';
  if (has('restless', 'aimless')) profile.growth_arc_anchor.latent_potential = 'channeling restless energy into purposeful direction';
  // Populate meta
  const populated = Object.entries(profile).filter(([k, v]) => {
    if (k === '_meta') return false;
    const serialized = JSON.stringify(v);
    return /[\p{L}\p{N}]/u.test(serialized);
  });
  profile._meta.populated_domains = populated.map(([k]) => k);
  profile._meta.confidence_avg = 0.4;
  return profile;
}
globalThis.Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return createCorsResponse();
  if (req.method !== 'POST') return createErrorResponse('Method not allowed', 405);
  try {
    const { user, supabaseAdmin } = await authenticateUser(req);
    return await withRateLimit(req, user.id, async ()=>{
      const body = await req.json().catch(()=>null);
      if (!body?.character_id) return createErrorResponse('character_id required', 400);
      const { data: charData, error } = await fetchCharacterBundle(supabaseAdmin, body.character_id, user.id);
      if (error === 'not_found') {
        console.warn('latent.error.character_not_found', {
          characterId: body.character_id
        });
        return createErrorResponse('Character not found', 404);
      }
      if (error === 'forbidden') {
        console.warn('latent.error.forbidden', {
          characterId: body.character_id,
          userId: user.id
        });
        return createErrorResponse('Forbidden', 403);
      }
      // Build canonical source & compute hash
      const canonical = buildCanonicalSource(charData);
      // Remove undefined keys to reduce noise
      for (const k of Object.keys(canonical.text_sections)){
        if (canonical.text_sections[k] == null) delete canonical.text_sections[k];
      }
      const sourceHash = await sha256(stableStringify(canonical));
      if (await alreadyFresh(supabaseAdmin, body.character_id, sourceHash)) {
        return createCorsResponse({
          status: 'fresh'
        });
      }
      const regenCount = await countRecentRegens(supabaseAdmin, body.character_id);
      if (regenCount >= MAX_REGEN_PER_DAY) {
        return createCorsResponse({
          status: 'rate_limited'
        });
      }
      const prompt = buildPrompt(canonical);
      // Single-attempt model call (removed retry loop for cost/time control)
      let cleanedResult = null;
      let populatedDomains = 0;
      let confidenceAvg = 0;
      console.log('latent.version.start', {
        version: EXTRACTION_VERSION,
        characterId: body.character_id
      });
      let rawModelOutput = '';
      try {
        rawModelOutput = await callModel(prompt);
        console.log('latent.model.raw', {
          attempt: 1,
          snippet: rawModelOutput.slice(0, 400),
          len: rawModelOutput.length
        });
      } catch (e) {
        console.error('model call failed', {
          attempt: 1,
          error: e?.message
        });
      }
      if (rawModelOutput) {
        const modelJson = extractJson(rawModelOutput);
        const keyCount = modelJson && typeof modelJson === 'object' ? Object.keys(modelJson).length : 0;
        console.log('latent.model.parsed', {
          attempt: 1,
          keyCount
        });
        const v = validateLatentProfile(modelJson);
        cleanedResult = v.cleaned;
        populatedDomains = v.populatedDomains;
        confidenceAvg = v.confidenceAvg;
        console.log('latent.extraction.attempt', {
          attempt: 1,
          populatedDomains,
          confidenceAvg
        });
      }
      if (!cleanedResult || populatedDomains < MIN_SAVE_POPULATED_DOMAINS) {
        console.warn('latent.extraction.low_quality', {
          populatedDomains,
          min: MIN_SAVE_POPULATED_DOMAINS
        });
        const fallback = heuristicFallback(canonical);
        const v2 = validateLatentProfile(fallback);
        cleanedResult = v2.cleaned;
        populatedDomains = v2.populatedDomains;
        confidenceAvg = v2.confidenceAvg;
        console.log('latent.extraction.fallback_applied', {
          populatedDomains
        });
      }
      if (!cleanedResult || populatedDomains < MIN_SAVE_POPULATED_DOMAINS) {
        return createCorsResponse({
          status: 'skipped_low_quality',
          populatedDomains,
          attempts: 1
        }, 200);
      }
      const { error: upErr } = await supabaseAdmin.rpc('upsert_character_latent_profile', {
        p_character_id: body.character_id,
        p_profile: cleanedResult,
        p_source_card_hash: sourceHash,
        p_extraction_version: EXTRACTION_VERSION,
        p_confidence_avg: confidenceAvg,
        p_populated_domains: populatedDomains,
        p_token_cost: null
      });
      if (upErr) {
        console.error('latent.persist.failed', {
          message: upErr.message
        });
        return createCorsResponse({
          status: 'persist_failed',
          populatedDomains,
          attempts: 1
        }, 200);
      }
      return createCorsResponse({
        status: 'ok',
        domains: populatedDomains,
        confidence: confidenceAvg,
        attempts: 1
      }, 200);
    });
  } catch (e) {
    console.error('fatal', e);
    return createErrorResponse('unauthorized', 401);
  }
});

