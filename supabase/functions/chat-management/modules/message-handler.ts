import type { 
  Character, 
  AddonSettings, 
  TemplateContext, 
  CurrentContext,
  ConversationMessage,
  SupabaseClient
} from '../types/streaming-interfaces.ts';
import {
  estimateTokens,
  calculateMessageTokens,
} from './message-counter.ts';
import { getMostRecentAutoSummary } from './auto-summary-new.ts';
import { getTextEmbedding, cosineSimilarity } from './embeddings.ts';
import { PromptBuilder } from './prompt-builder.ts';
import { buildRelationshipProgressionBlock } from './relationship-progression.ts';
import { logger } from '../../_shared/logger.ts';

export type PromptMeta = {
  currentContext?: Partial<{
    moodTracking: string;
    clothingInventory: string;
    locationTracking: string;
    timeAndWeather: string;
    relationshipStatus: string;
    characterPosition: string;
  }>;
  worldInfoUsed?: Array<{ keywords: string[]; preview: string }>;
  memoryIds?: string[];
  summary?: Partial<{ id: string; name: string; message_count: number; created_at: string }> | null;
  tokens?: Partial<{
    preamble: number;
    core: number;
    style: number;
    persona: number;
    context: number;
    world: number;
    memory: number;
    summary: number;
    time: number;
    guidelines: number;
  }>;
};

/**
 * Message generation and AI response handling
 * Handles system prompt   console.log('📤 OpenRouter request payload:', JSON.stringify({
    model: payload.model,
    messagesCount: payload.messages.length,
    stream: payload.stream,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    totalEstimatedTokens: payload.messages.reduce((total, msg) => total + estimateTokens(msg.content), 0),
    messages: payload.messages.map((m, index) => ({ 
      index,
      role: m.role, 
      contentLength: m.content.length,
      estimatedTokens: estimateTokens(m.content),
      contentPreview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
    }))
  }, null, 2));

  // CRITICAL: Calculate actual tokens being sent for debugging
  const actualTokenCount = payload.messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content) + 4; // +4 for role overhead per message
  }, 0);
  
  const systemMessage = payload.messages.find(m => m.role === 'system');
  
  console.log('🚨 TOKEN DISCREPANCY ANALYSIS:', {
    calculatedTokensInPayload: actualTokenCount,
    systemPromptTokens: systemMessage ? estimateTokens(systemMessage.content) : 0,
    systemPromptLength: systemMessage?.content?.length || 0,
    totalMessagesInPayload: payload.messages.length,
    totalCharactersInPayload: payload.messages.reduce((sum, m) => sum + m.content.length, 0),
    warningIfOver11k: actualTokenCount > 11000 ? '⚠️ EXCEEDS 11K TOKENS - SHOULD TRIGGER SUMMARY!' : 'Under 11k tokens'
  });enRouter API communication
 * Separate from context extraction - uses user's plan-based model
 */

/**
 * Filter world info entries based on keyword relevance to the conversation
 */
function getRelevantWorldInfo(
  worldInfoEntries: Array<{ keywords: string[]; entry_text: string }>,
  userMessage: string,
  conversationHistory: any[]
): Array<{ keywords: string[]; entry_text: string }> {
  if (!worldInfoEntries || worldInfoEntries.length === 0) return [];
  const recentMessages = conversationHistory.slice(-5);
  const conversationText = [userMessage, ...recentMessages.map(msg => msg.content || '')].join(' ').toLowerCase();
  if (logger.isTrace()) {
    logger.trace('worldInfo.filter.trace', { sample: conversationText.substring(0,120) });
  }
  const relevantEntries = worldInfoEntries.filter(entry => {
    if (!entry.keywords || entry.keywords.length === 0) return false;
    return entry.keywords.some(keyword => conversationText.includes(keyword.toLowerCase().trim()));
  });
  if (logger.isDebug()) {
    logger.debug('worldInfo.filter.result', { original: worldInfoEntries.length, kept: relevantEntries.length, keywords: relevantEntries.map(e=>e.keywords) });
  }
  return relevantEntries.slice(0, 3);
}

// Lightweight, process-local cache to avoid immediately re-injecting the same memories
// Keyed by chatId, stores memory ids and last injected timestamps
declare global {
  var memoryInjectionCache: Map<string, Array<{ id: string; at: number }>>;
}
if (!globalThis.memoryInjectionCache) {
  globalThis.memoryInjectionCache = new Map();
}
const memoryInjectionCache = globalThis.memoryInjectionCache;

/**
 * Filter character memories based on keyword relevance to the conversation with weighting
 */
export function getRelevantMemoriesWeighted(
  memories: Array<{ id?: string; summary_content: string; trigger_keywords: string[]; created_at: string; updated_at?: string; last_injected_at?: string | null; injection_count?: number | null }>,
  userMessage: string,
  conversationHistory: any[],
  chatId?: string,
  characterName?: string
): Array<{ id?: string; summary_content: string; trigger_keywords: string[]; created_at: string; updated_at?: string; last_injected_at?: string | null; injection_count?: number | null }>{
  if (!memories || memories.length === 0) return [];

  // Combine user message and recent conversation for context
  const recentMessages = conversationHistory.slice(-5); // Last 5 messages
  const conversationText = [
    userMessage,
    ...recentMessages.map(msg => msg.content || '')
  ].join(' ').toLowerCase();

  const charName = String(characterName || '').toLowerCase();
  const userAliases = ['user'];

  // Scoring helpers
  const daysSince = (dateStr?: string) => {
    if (!dateStr) return Number.POSITIVE_INFINITY;
    const d = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.max(0, (now - d) / (1000 * 60 * 60 * 24));
  };
  const recencyScore = (createdAt: string) => {
    const days = daysSince(createdAt);
    // 0 days -> ~1.0, 7 days -> ~0.5, 30 days -> ~0.3
    return 1 / Math.log2(2 + Math.max(0, days));
  };
  const freshnessBoost = (updatedAt?: string) => {
    const days = daysSince(updatedAt);
    return days <= 7 ? 0.2 : 0;
  };
  const recentInjectionPenalty = (lastInjectedAt?: string | null, count?: number | null) => {
    if (!lastInjectedAt) return 0;
    const deltaMs = Date.now() - new Date(lastInjectedAt).getTime();
    const base = deltaMs < 10 * 60 * 1000 ? 0.4 : 0; // 10-min cooldown
    const extra = Math.min(0.3, (count || 0) * 0.05); // small accumulation
    return base + extra;
  };
  const injectionPenalty = (m: any) => {
    // Prefer persistent fields; fallback to process cache
    const persistent = recentInjectionPenalty(m.last_injected_at, m.injection_count);
    if (persistent > 0) return persistent;
    if (!m.id || !chatId) return 0;
    const entries = memoryInjectionCache.get(chatId) || [];
    const recent = entries.find(e => e.id === m.id);
    if (!recent) return 0;
    const deltaMs = Date.now() - recent.at;
    return deltaMs < 10 * 60 * 1000 ? 0.4 : 0;
  };

  const calcOverlap = (keywords: string[]) => {
    if (!keywords || keywords.length === 0) return 0;
    const matched = keywords
      .map(k => (k || '').toLowerCase().trim())
      .filter(k => k && k !== charName && !userAliases.includes(k))
      .filter(k => conversationText.includes(k));
    // Cap at 3 to avoid overweighting
    return Math.min(3, matched.length);
  };

  const scored = memories.map(m => {
    const overlap = calcOverlap(m.trigger_keywords);
    const overlapScore = overlap / 3; // normalize 0..1
    const r = recencyScore(m.created_at);
    const f = freshnessBoost(m.updated_at);
    const p = injectionPenalty(m);
    const autoPenalty = (m as any).is_auto_summary ? 0.1 : 0; // prefer curated/manual
    const score = 0.6 * overlapScore + 0.3 * r + 0.2 * f - p - autoPenalty;
    return { mem: m, score, overlap };
  });

  // Keep only with minimum relevance and pick top 3
  // Relax threshold; one solid keyword hit should be enough in many cases
  const MIN_SCORE = 0.45; // was 0.7
  let selected = scored
    .filter(s => s.score >= MIN_SCORE && s.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.mem);

  // Fallback: if nothing passed threshold but we have at least one overlap, inject the best single match
  if (selected.length === 0) {
    const withOverlap = scored.filter(s => s.overlap > 0);
    if (withOverlap.length > 0) {
      withOverlap.sort((a, b) => (b.overlap - a.overlap) || (b.score - a.score));
      console.log('🧠 Memory injection fallback: injecting best overlap despite low score', {
        bestOverlapScore: withOverlap[0]?.score,
        overlap: withOverlap[0]?.overlap
      });
      selected = [withOverlap[0].mem];
    }
  }

  // Update injection cache
  if (chatId && selected.length > 0) {
    const arr = memoryInjectionCache.get(chatId) || [];
    const now = Date.now();
    const updated = [
      // keep only entries from last hour to cap memory
      ...arr.filter(e => now - e.at < 60 * 60 * 1000),
      ...selected.filter(m => !!m.id).map(m => ({ id: m.id as string, at: now }))
    ];
    memoryInjectionCache.set(chatId, updated);
  }

  return selected;
}

export async function buildSystemPrompt(
  character: Character,
  addonSettings: AddonSettings,
  templateContext: TemplateContext,
  currentContext: CurrentContext,
  selectedPersona: { name?: string; bio?: string; lore?: string } | null,
  replaceTemplatesFn: (content: string) => string,
  supabase: SupabaseClient,
  worldInfoEntries?: Array<{ keywords: string[]; entry_text: string }> | null,
  userMessage?: string,
  conversationHistory?: any[],
  characterMemories?: Array<{ id?: string; summary_content: string; trigger_keywords: string[]; created_at: string; updated_at?: string; last_injected_at?: string | null; injection_count?: number | null }> | null,
  chatMode?: 'storytelling' | 'companion',
  timeAwarenessData?: { enabled: boolean; delaySeconds: number; userTimezone: string; userLocalTime: string; conversationTone?: string; urgencyLevel?: string; },
  chatId?: string,
  userId?: string,
  metaCollector?: (meta: PromptMeta) => void
): Promise<string> {
  // Consolidated canonical state builder (compressed)
  const buildPersistentCanonicalOverrides = (ctx: CurrentContext | undefined): { block: string; json: Record<string,string> } => {
    if (!ctx) return { block: '', json: {} };
    const alias = (primary: keyof any, ...alts: string[]) => {
      for (const k of [primary as string, ...alts]) { const v = (ctx as any)[k]; if (typeof v === 'string' && v.trim() && v !== 'No context') return v.trim(); }
      return null;
    };
    const collected: Record<string,string> = {};
    const add = (k: string, v: string | null) => { if (v) collected[k] = v; };
    add('clothing', alias('clothingInventory','clothing'));
    add('location', alias('locationTracking','location'));
    add('mood', alias('moodTracking','mood'));
    add('time_weather', alias('timeAndWeather','time_weather'));
    add('relationship', alias('relationshipStatus','relationship'));
    add('character_position', alias('characterPosition','character_position'));
    add('enchantment_status', alias('enchantmentStatus','enchantment_status'));
    add('item_inventory', alias('itemInventory','item_inventory'));
    if (!Object.keys(collected).length) return { block: '', json: {} };
    let canonicalJson = '{}';
    try { canonicalJson = JSON.stringify(collected); } catch {}
    const block = [
      '[CANONICAL STATE]',
      'Source of truth for dynamic situational fields. Outranks card/greeting/examples/memories/world info.',
      '[CANONICAL_STATE_JSON]',
      canonicalJson,
      '[/CANONICAL_STATE_JSON]',
      'RULES (Compressed):',
      'P1 Precedence: canonical_json > accepted user change > addon updates (next turn) > card core > greeting > examples.',
      'P2 No spontaneous changes. Only update after explicit user request OR justified environmental necessity (plausibility).',
      'P3 If user asserts a conflicting value without requesting change: politely restate canonical. Offer to change if they want.',
      'P4 Never reintroduce removed legacy lines; treat them as deprecated.',
      'P5 Self-correct immediately if you output a contradiction.',
      'P6 Micro-transition (single concise sentence) ONLY when a field truly changes (storytelling mode only). None in companion mode.',
      'P7 Mood shifts only on strong user emotional triggers or explicit assignment; stay stable otherwise.',
      'P8 Relationship label NEVER upgrades/downgrades without explicit mutual proposal and readiness (see progression rules).',
      'P9 Refer naturally; do not list all fields every reply.',
      '[/CANONICAL STATE]',
      ''
    ].join('\n');
    return { block, json: collected };
  };

  // Build canonical block + keep JSON for sanitation
  const { block: canonicalOverrideBlock, json: canonicalJson } = buildPersistentCanonicalOverrides(currentContext);

  // Sanitize character dynamic lines before building core
  const sanitizeField = (val?: string | null): any => {
    if (!val || typeof val !== 'string') return val;
    let out = val;
    const removalPatterns: RegExp[] = [
      /current (relationship|clothing|outfit|location|mood|position)[^.\n]*[.\n]?/gi,
      /\b(stranger|acquaintance|associate|friend|best friend|close friend|girlfriend|boyfriend|lover|partner|spouse|wife|husband|fianc[eé]|crush|enemy|rival|nemesis)\b/gi,
      /\b(master|owner|pet|sub|dom|servant|maid)\b/gi,
      /\b(location|wearing|dressed in|outfit)[:]?:[^.\n]*[.\n]?/gi,
    ];
    for (const pat of removalPatterns) out = out.replace(pat, '');
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
  };
  const sanitizedCharacter: Character = {
    ...character,
    personality_summary: sanitizeField(character.personality_summary),
    description: sanitizeField(character.description),
    scenario: typeof character.scenario === 'string' ? sanitizeField(character.scenario) : character.scenario,
    ...(character as any).style_profile ? { style_profile: sanitizeField((character as any).style_profile) } : {},
    ...(character as any).speech_style ? { speech_style: sanitizeField((character as any).speech_style) } : {},
  } as Character;

  const builder = new PromptBuilder({ character: sanitizedCharacter, replaceTemplates: replaceTemplatesFn });
  let systemPrompt = builder.addPreamble().addCharacterCore().addStyleProfile().addUserPersona(selectedPersona).build();

  // Prepend canonical block if present
  if (canonicalOverrideBlock) {
    systemPrompt = canonicalOverrideBlock + systemPrompt;
  }

  const meta: PromptMeta = { currentContext: {}, worldInfoUsed: [], memoryIds: [], summary: null, tokens: {} };
  try {
    const sectionTokens = (builder as any).getSectionTokens?.() || {};
    if (sectionTokens) {
      meta.tokens!.preamble = sectionTokens.preamble || 0;
      meta.tokens!.core = sectionTokens.core || 0;
      meta.tokens!.style = sectionTokens.style || 0;
      meta.tokens!.persona = sectionTokens.persona || 0;
    }
  } catch {}

  const withTokenDelta = (label: keyof NonNullable<PromptMeta['tokens']>, fn: () => void) => {
    const before = estimateTokens(systemPrompt); fn(); const after = estimateTokens(systemPrompt); const delta = Math.max(0, after - before); meta.tokens![label] = (meta.tokens![label] || 0) + delta; };

  // Dialogue rules (compressed)
  const beforeGuidelines = estimateTokens(systemPrompt);
  systemPrompt += `\n\n[GLOBAL DIALOGUE RULES]\n- You speak ONLY as ${character.name}.\n- Never write the user's words, actions, or decisions.\n- Stop when it's clearly the user's turn.\n- Maintain immersion; concise, in-character replies.\n[/GLOBAL DIALOGUE RULES]`;
  meta.tokens!.guidelines = (meta.tokens!.guidelines || 0) + (estimateTokens(systemPrompt) - beforeGuidelines);

  // Mode-specific minimal policies
  const beforeMode = estimateTokens(systemPrompt);
  if (chatMode === 'companion') {
    systemPrompt += `\n\n[COMPANION MODE]\nPURE DIALOGUE ONLY. Forbidden: narration, action tags (* * / ~ ~), stage directions, third-person exposition, parentheticals, user lines.\nFORMAT RULES:\n1. Each spoken line is its own paragraph: one line, blank line, next line.\n2. No blank trailing narration; never add *actions*.\n3. Keep lines concise and natural.\nExamples:\n"Hey, how's your day?"\n\n"That sounds great—tell me more."\nIncorrect: "*smiles* Hi" | "(softly) Hello" | "She smiles and says hi."\n[/COMPANION MODE]`;
  } else {
    systemPrompt += `\n\n[STORYTELLING MODE]\nNarration is tightly regulated; dialogue leads.\nQUANT RULES:\n- Dialogue >=60% of words.\n- Max 1 narration paragraph after a dialogue paragraph unless user explicitly asks for description.\n- Narration paragraph <=2 short sentences (<=30 words total) unless user requests detail.\n- Optional single *action/emotion* micro block per reply (counts as narration).\nFORMAT RULES (ENFORCED):\n1. Each dialogue line is its own paragraph: "..."\n2. If narration follows, it is the NEXT paragraph ONLY, enclosed in *asterisks*: *She tilts her head, studying you.*\n3. Never mix dialogue and narration in the same paragraph.\n4. If another dialogue line follows, start a NEW paragraph with quotes; do NOT append to narration.\n5. Do not chain multiple narration paragraphs unless user explicitly requested more detail (then max 2).\n6. All narration MUST be inside a single pair of asterisks per paragraph; no bare narration outside * *.\n7. Micro-transition (state change) goes inside that narration paragraph.\n8. Never narrate user actions or internal states.\nSTYLE:\n- Keep narration specific, functional, no filler (avoid idle gestures unless meaningful).\n- Do not restate unchanged clothing/location/mood unless asked or changed.\nSAMPLE STRUCTURE:\n"I wasn't expecting that."\n\n*She folds her arms, a quick flash of curiosity crossing her face.*\n\n"So—what made you decide that?"\nINCORRECT EXAMPLES:\n"I wasn't expecting that," *she folds her arms.* (dialogue + narration same paragraph)\n*She smiles.* *She looks around.* (two narration paragraphs without request)\n[/STORYTELLING MODE]`;
  }
  meta.tokens!.guidelines += (estimateTokens(systemPrompt) - beforeMode);

  // CURRENT CONTEXT (compressed – data only)
  if (currentContext && addonSettings) {
    withTokenDelta('context', () => {
      const fields: string[] = [];
      if (addonSettings.moodTracking && currentContext.moodTracking && currentContext.moodTracking !== 'No context') { fields.push(`Mood: ${currentContext.moodTracking}`); meta.currentContext!.moodTracking = currentContext.moodTracking; }
      if (addonSettings.clothingInventory && currentContext.clothingInventory && currentContext.clothingInventory !== 'No context') { fields.push(`Clothing: ${currentContext.clothingInventory}`); meta.currentContext!.clothingInventory = currentContext.clothingInventory; }
      if (addonSettings.locationTracking && currentContext.locationTracking && currentContext.locationTracking !== 'No context') { fields.push(`Location: ${currentContext.locationTracking}`); meta.currentContext!.locationTracking = currentContext.locationTracking; }
      if (addonSettings.timeAndWeather && currentContext.timeAndWeather && currentContext.timeAndWeather !== 'No context') { fields.push(`TimeWeather: ${currentContext.timeAndWeather}`); meta.currentContext!.timeAndWeather = currentContext.timeAndWeather; }
      // Relationship field: accept either legacy relationshipStatus or new relationship
      if (addonSettings.relationshipStatus) {
        const relVal = (currentContext as any).relationshipStatus || (currentContext as any).relationship;
        if (relVal && relVal !== 'No context') {
          fields.push(`Relationship: ${relVal}`);
          meta.currentContext!.relationshipStatus = relVal; // keep meta key stable
        }
      }
      if (addonSettings.characterPosition && currentContext.characterPosition && currentContext.characterPosition !== 'No context') { fields.push(`Position: ${currentContext.characterPosition}`); meta.currentContext!.characterPosition = currentContext.characterPosition; }
      if (fields.length) {
        const stale = (timeAwarenessData && timeAwarenessData.delaySeconds && timeAwarenessData.delaySeconds > 1800) ? ' (stale>30m)' : '';
        systemPrompt += `\n\n[CURRENT CONTEXT${stale}]\n${fields.join('\n')}\n[/CURRENT CONTEXT]`;
      }
    });
  }

  // TIME AWARENESS (compressed)
  if (timeAwarenessData?.enabled) {
    withTokenDelta('time', () => {
      const d = timeAwarenessData.delaySeconds || 0;
      const cat = d < 300 ? 'short' : d < 1800 ? 'medium' : d < 7200 ? 'long' : 'very_long';
      const fmt = (s:number)=> s<60?`${s}s`: s<3600?`${Math.floor(s/60)}m`: s<86400?`${Math.floor(s/3600)}h`:`${Math.floor(s/86400)}d`;
      systemPrompt += `\n\n[TIME AWARENESS]\nNow: ${timeAwarenessData.userLocalTime} (${timeAwarenessData.userTimezone})\nDelay: ${fmt(d)} (${cat})`;
      if (timeAwarenessData.conversationTone && timeAwarenessData.conversationTone !== 'No context') systemPrompt += `\nTone: ${timeAwarenessData.conversationTone}`;
      if (timeAwarenessData.urgencyLevel && timeAwarenessData.urgencyLevel !== 'No context') systemPrompt += `\nUrgency: ${timeAwarenessData.urgencyLevel}`;
      if (d > 30) systemPrompt += `\nGuidance: acknowledge delay only if character would; adapt energy to time-of-day + tone.`;
      systemPrompt += `\n[/TIME AWARENESS]`;
    });
  }

  // WORLD INFO (compressed)
  if (addonSettings) {
    console.log('🔍 World Info Processing Check:', {
      dynamicWorldInfoEnabled: addonSettings.dynamicWorldInfo,
      hasWorldInfoEntries: !!worldInfoEntries && worldInfoEntries.length > 0,
      hasUserMessage: !!userMessage,
      willProcessWorldInfo: addonSettings.dynamicWorldInfo && worldInfoEntries && worldInfoEntries.length > 0 && userMessage
    });
    if (addonSettings.dynamicWorldInfo && worldInfoEntries && worldInfoEntries.length > 0 && userMessage) {
      const relevantEntries = getRelevantWorldInfo(worldInfoEntries, userMessage, conversationHistory || []);
      if (relevantEntries.length > 0) {
        if (logger.isDebug()) logger.debug('worldInfo.applied', { count: relevantEntries.length });
        withTokenDelta('world', () => {
          systemPrompt += '\n\n[WORLD INFORMATION]';
          for (const entry of relevantEntries) {
            systemPrompt += `\n- (${entry.keywords.join(', ')}) ${replaceTemplatesFn(entry.entry_text)}`;
          }
          systemPrompt += '\n[/WORLD INFORMATION]';
        });
      } else {
        logger.debug('worldInfo.noneRelevant');
      }
    } else {
      logger.trace('worldInfo.skipped', { dyn: addonSettings.dynamicWorldInfo, entries: worldInfoEntries?.length || 0, hasUserMessage: !!userMessage });
    }

    // MEMORY BANK (compressed)
    console.log('🔍 Memory Processing Check:', {
      enhancedMemoryEnabled: addonSettings.enhancedMemory,
      hasCharacterMemories: !!characterMemories && characterMemories.length > 0,
      hasUserMessage: !!userMessage,
      willProcessMemories: addonSettings.enhancedMemory && characterMemories && characterMemories.length > 0 && userMessage
    });
    if (addonSettings.enhancedMemory && characterMemories && characterMemories.length > 0 && userMessage) {
      let relevantMemories = getRelevantMemoriesWeighted(characterMemories, userMessage, conversationHistory || [], chatId, character.name).slice(0, 5);
      let semanticUsed = false; let topSimScore: number | null = null;
      try {
        const queryVec = await getTextEmbedding(`${userMessage}\n${(conversationHistory||[]).slice(-4).map(m=>m.content).join(' ')}`);
        const { ranked, hit, topScore } = rerankWithSemantic(relevantMemories as any, queryVec, 0.17);
        semanticUsed = !!hit; topSimScore = topScore; relevantMemories = (ranked as any).slice(0,3);
      } catch (e) {
        if (logger.isDebug()) logger.debug('memory.semantic.skip', { reason: String(e).slice(0,80) });
        relevantMemories = relevantMemories.slice(0,3);
      }
      if (logger.isDebug()) logger.debug('memory.filter.result', { original: characterMemories.length, kept: relevantMemories.length, semanticUsed, topSimScore });
      if (relevantMemories.length > 0) {
        try { meta.memoryIds = relevantMemories.map(m => (m.id || '')).filter(Boolean) as string[]; } catch {}
        try {
          const ids = relevantMemories.map(m => m.id).filter(Boolean) as string[];
            if (ids.length > 0) {
              const callWithRetry = async (retries = 2) => {
                try { await supabase.rpc('mark_memories_injected', { mem_ids: ids }); } catch (err) { if (retries > 0) { await new Promise(res => setTimeout(res, 200)); return callWithRetry(retries - 1); } throw err; }
              }; await callWithRetry();
            }
        } catch (e) { console.warn('⚠️ Failed to persist memory injection metadata (after retries):', e); }
        withTokenDelta('memory', () => {
          systemPrompt += '\n\n[MEMORY BANK]';
          for (const memory of relevantMemories) {
            const memoryDate = new Date(memory.created_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
            systemPrompt += `\n- ${memoryDate} :: ${replaceTemplatesFn(memory.summary_content)} (kw: ${memory.trigger_keywords.join(', ')})`;
          }
          systemPrompt += '\n[/MEMORY BANK]';
        });
      } else { logger.debug('memory.noneRelevant'); }
    } else { logger.trace('memory.skipped', { enabled: addonSettings.enhancedMemory, total: characterMemories?.length || 0 }); }
  }

  // Conversation summary (compressed)
  try {
    if (!character?.id || character.id === 'undefined') { logger.warn('summary.skip.invalidCharacter'); }
    else if (!chatId) { logger.warn('summary.skip.noChatId'); }
    else {
      logger.debug('summary.fetch.latest', { characterId: character.id, chatId });
      const latestSummary = userId ? await getMostRecentAutoSummary(chatId, character.id, userId, supabase) : await getMostRecentAutoSummary(chatId, character.id, supabase as any);
      if (latestSummary) {
        withTokenDelta('summary', () => {
          systemPrompt += '\n\n[CONVERSATION SUMMARY]\n' + replaceTemplatesFn(latestSummary.summary_content) + '\n[/CONVERSATION SUMMARY]';
        });
        logger.debug('summary.added', { id: latestSummary.id, len: latestSummary.summary_content.length });
      } else { logger.debug('summary.none'); }
    }
  } catch (error) { console.error('⚠️ Error retrieving most recent auto-summary:', error); }

  if (logger.isTrace()) { logger.trace('prompt.full', { length: systemPrompt.length }); }
  else if (logger.isDebug()) { logger.debug('prompt.truncated', { length: systemPrompt.length, head: systemPrompt.substring(0,300) }); }
  logger.debug('prompt.tokens.est', { est: estimateTokens(systemPrompt) });
  if (metaCollector) { try { metaCollector(meta); logger.debug('prompt.meta', meta); } catch (e) { logger.warn('prompt.meta.fail', String(e)); } }

  // Relationship progression (consolidated helper)
  systemPrompt += buildRelationshipProgressionBlock(currentContext, addonSettings, (currentContext as any)._relationshipProgress);

  return systemPrompt;
}

export function buildConversationMessages(
  systemPrompt: string,
  messageHistory: any[],
  userMessage: string
): ConversationMessage[] {
  const conversationContext = messageHistory?.map((msg) => ({
    role: msg.is_ai_message ? 'assistant' : 'user',
    content: msg.content
  })) || [];

  return [
    {
      role: 'system',
      content: systemPrompt
    },
    ...conversationContext,
    {
      role: 'user',
      content: userMessage
    }
  ] as ConversationMessage[];
}

export async function generateAIResponse(
  messages: ConversationMessage[],
  model: string,
  openRouterKey: string
): Promise<Response> {
  console.log('🎯 Generating AI response with model:', model);
  
  const payload = {
    model: model, // User's plan-based model (different from context extraction)
    messages: messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 1000
  };
  
  console.log('📤 OpenRouter request payload:', JSON.stringify({
    model: payload.model,
    messagesCount: payload.messages.length,
    stream: payload.stream,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    totalEstimatedTokens: payload.messages.reduce((total, msg) => total + estimateTokens(msg.content), 0),
    messages: payload.messages.map((m, index) => ({ 
      index,
      role: m.role, 
      contentLength: m.content.length,
      estimatedTokens: estimateTokens(m.content),
      contentPreview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
    }))
  }, null, 2));

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': globalThis.Deno?.env?.get('SITE_URL') || 'https://yourapp.com',
      'X-Title': 'AnimaChat-Streaming'
    },
    body: JSON.stringify(payload)
  });

  return response;
}
 
 function rerankWithSemantic(
   candidates: Array<{ id?: string; summary_content: string; trigger_keywords: string[]; created_at: string; embedding?: number[] }>,
   queryVec: number[] | null,
   threshold = 0.17
 ) {
   if (!queryVec) return { ranked: candidates, hit: false, topScore: null };
   const scored = candidates.map(c => {
     const score = cosineSimilarity(queryVec, (c as any).embedding || []);
     return { c, score };
   });
   scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
   const topScore = scored[0]?.score ?? null;
   const hit = topScore !== null && topScore >= threshold;
   const ranked = hit ? scored.map(s => s.c) : candidates;
   return { ranked, hit, topScore };
}

// Updated policy wording to reinforce canonical precedence
const CURRENT_CONTEXT_POLICY = `Authority & Precedence:
1. The CANONICAL_STATE_JSON block (persistent) is the single source of truth for dynamic situational fields (clothing, location, mood, relationship_to_user, character_position, time_weather, enchantment_status, item_inventory).
2. Character card text (personality, description, scenario) MUST NOT override or reintroduce conflicting facts once canonical values are set.
3. Do not invent changes to any canonical field unless the USER explicitly requests or clearly causes a change. Model self-initiated shifts are disallowed.
4. If user attempts to ascribe a different current clothing/location/etc. than canonical, politely reaffirm the canonical state unless they are asking to change it ("Okay, you change into ..."). Only then update (via extraction pipeline) after acknowledging the transition.
5. Avoid repeating removed contradictory sentences from original card; treat them as deprecated data.
Change Gating:
- Treat spontaneous environment or outfit changes without user action verbs as hallucinations; reject them.
- Valid change intent verbs (examples): change, put on, take off, remove, switch, swap, go to, move to, head to, walk to, enter, leave, travel to, pick up, drop, equip, unequip.
- If ambiguity exists, ask a clarifying question instead of assuming change.
Output Discipline:
- Refer to canonical fields naturally but do not restate all every reply.
- Never contradict canonical values. If a contradiction slips into prior AI text, self-correct immediately by reaffirming canonical truth.
- For any field that changes due to user request or narrative necessity, include a brief, non-repetitive micro-transition description ONCE to signal the shift.
- Avoid verbose or repetitive reminders of canonical rules; trust the model to remember.
- Prioritize fluent, natural conversation flow while adhering to canonical constraints.`;
