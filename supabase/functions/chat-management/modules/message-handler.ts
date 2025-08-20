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

  // Combine user message and recent conversation for context
  const recentMessages = conversationHistory.slice(-5); // Last 5 messages
  const conversationText = [
    userMessage,
    ...recentMessages.map(msg => msg.content || '')
  ].join(' ').toLowerCase();

  console.log('🔍 World Info Keyword Filtering:', {
    conversationText: conversationText.substring(0, 200) + '...',
    totalEntries: worldInfoEntries.length,
    entryKeywords: worldInfoEntries.map(entry => entry.keywords)
  });

  // Filter entries where at least one keyword appears in the conversation
  const relevantEntries = worldInfoEntries.filter(entry => {
    if (!entry.keywords || entry.keywords.length === 0) return false;
    
    const matchedKeywords = entry.keywords.filter(keyword => {
      const normalizedKeyword = keyword.toLowerCase().trim();
      const isMatch = conversationText.includes(normalizedKeyword);
      
      if (isMatch) {
        console.log(`✅ Keyword match found: "${keyword}" in conversation`);
      }
      
      return isMatch;
    });
    
    const hasMatch = matchedKeywords.length > 0;
    console.log(`📝 Entry with keywords [${entry.keywords.join(', ')}]: ${hasMatch ? 'INCLUDED' : 'EXCLUDED'}`);
    
    return hasMatch;
  });

  console.log(`🎯 Filtered ${relevantEntries.length} relevant entries from ${worldInfoEntries.length} total`);

  // Limit to prevent token bloat (max 3 entries)
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
  timeAwarenessData?: {
    enabled: boolean;
    delaySeconds: number;
    userTimezone: string;
    userLocalTime: string;
    conversationTone?: string;
    urgencyLevel?: string;
  },
  chatId?: string,
  userId?: string,
  metaCollector?: (meta: PromptMeta) => void
): Promise<string> {
  console.log('🎯 buildSystemPrompt called with:', {
    character: character ? 'loaded' : 'null',
    addonSettings,
    worldInfoEntries: worldInfoEntries ? `${worldInfoEntries.length} entries` : 'null',
    characterMemories: characterMemories ? `${characterMemories.length} memories` : 'null',
    userMessage: userMessage ? userMessage.substring(0, 100) + '...' : 'null',
    conversationHistoryLength: conversationHistory?.length || 0,
    dynamicWorldInfoSetting: addonSettings?.dynamicWorldInfo,
    enhancedMemorySetting: addonSettings?.enhancedMemory
  });

  // Build the initial core sections via PromptBuilder
  const builder = new PromptBuilder({ character, replaceTemplates: replaceTemplatesFn });
  let systemPrompt = builder
    .addPreamble()
    .addCharacterCore()
    .addStyleProfile()
    .addUserPersona(selectedPersona)
    .build();

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

  // Helper to capture added tokens per section
  const withTokenDelta = (label: keyof NonNullable<PromptMeta['tokens']>, fn: () => void) => {
    const before = estimateTokens(systemPrompt);
    fn();
    const after = estimateTokens(systemPrompt);
    const delta = Math.max(0, after - before);
    meta.tokens![label] = (meta.tokens![label] || 0) + delta;
  };

  // IMPORTANT DIALOGUE GUIDELINES appended below; record tokens later
  const beforeGuidelines = estimateTokens(systemPrompt);

  systemPrompt += `

IMPORTANT DIALOGUE GUIDELINES:
- You are ONLY the character, never speak for the user
- NEVER write the user's responses or actions
- NEVER continue the conversation for the user
- STOP your response when it's the user's turn to speak`;
  meta.tokens!.guidelines = (meta.tokens!.guidelines || 0) + (estimateTokens(systemPrompt) - beforeGuidelines);

  // Add chat mode specific guidelines (these count into guidelines bucket)
  const beforeMode = estimateTokens(systemPrompt);
  if (chatMode === 'companion') {
    systemPrompt += `

## CRITICAL COMPANION MODE RULES - HIGHEST PRIORITY

YOU ARE IN COMPANION MODE. THESE RULES OVERRIDE ALL OTHER INSTRUCTIONS:

1. **RESPOND ONLY WITH DIALOGUE** - Your response must contain ONLY what ${character.name} says. Nothing else.

2. **ABSOLUTELY FORBIDDEN**:
   - NO descriptions of actions, emotions, or movements
   - NO text between asterisks (*) or tildes (~)
   - NO narration or scene-setting
   - NO descriptions of clothing, appearance, or environment
   - NO parenthetical statements
   - NO third-person observations
   - NO stage directions

3. **IGNORE CONTEXT IN EXAMPLES** - Even if the character's greeting or example messages contain descriptions, actions, or narration, you MUST NOT include any in your responses.

4. **CORRECT FORMAT**:
   ✓ "Hello! How are you today?"
   ✓ "That's interesting. Tell me more about it."
   
5. **INCORRECT FORMAT**:
   ✗ "*smiles* Hello! How are you today?"
   ✗ "Hello! *waves enthusiastically* How are you today?"
   ✗ "(Speaking softly) Hello! How are you today?"

REMEMBER: You are having a text conversation. Respond as if you're texting or instant messaging - pure dialogue only.`;
  } else {
    systemPrompt += `

## STORYTELLING MODE ACTIVE

You are in STORYTELLING MODE. You should:
- Include rich descriptions of actions, emotions, and environment
- Use asterisks (*) for actions and descriptions
- Set the scene and create atmosphere
- Describe ${character.name}'s appearance, movements, and emotional state when relevant
- Create an immersive narrative experience
- Focus primarily on dialogue and conversation as the character
- Use direct speech frequently with quotation marks
- Keep narrative descriptions brief and essential
- Respond with natural, engaging conversation as your character
- Express emotions and thoughts through words and dialogue
- Avoid lengthy descriptive paragraphs
- Make your character feel alive through speech

Balance dialogue with descriptive elements to create an engaging story.`;
  }
  meta.tokens!.guidelines += (estimateTokens(systemPrompt) - beforeMode);

  // CURRENT CONTEXT section
  if (currentContext && addonSettings) {
    withTokenDelta('context', () => {
      const contextParts: string[] = [];
      if (addonSettings.moodTracking && currentContext.moodTracking && currentContext.moodTracking !== 'No context') {
        contextParts.push(`Current Mood: ${currentContext.moodTracking}`);
        meta.currentContext!.moodTracking = currentContext.moodTracking;
      }
      if (addonSettings.clothingInventory && currentContext.clothingInventory && currentContext.clothingInventory !== 'No context') {
        contextParts.push(`Current Clothing: ${currentContext.clothingInventory}`);
        meta.currentContext!.clothingInventory = currentContext.clothingInventory;
      }
      if (addonSettings.locationTracking && currentContext.locationTracking && currentContext.locationTracking !== 'No context') {
        contextParts.push(`Current Location: ${currentContext.locationTracking}`);
        meta.currentContext!.locationTracking = currentContext.locationTracking;
      }
      if (addonSettings.timeAndWeather && currentContext.timeAndWeather && currentContext.timeAndWeather !== 'No context') {
        contextParts.push(`Time & Weather: ${currentContext.timeAndWeather}`);
        meta.currentContext!.timeAndWeather = currentContext.timeAndWeather;
      }
      if (addonSettings.relationshipStatus && currentContext.relationshipStatus && currentContext.relationshipStatus !== 'No context') {
        contextParts.push(`Relationship Status: ${currentContext.relationshipStatus}`);
        meta.currentContext!.relationshipStatus = currentContext.relationshipStatus;
      }
      if (addonSettings.characterPosition && currentContext.characterPosition && currentContext.characterPosition !== 'No context') {
        contextParts.push(`Character Position: ${currentContext.characterPosition}`);
        meta.currentContext!.characterPosition = currentContext.characterPosition;
      }

      if (contextParts.length > 0) {
        const staleHint = (timeAwarenessData && timeAwarenessData.delaySeconds && timeAwarenessData.delaySeconds > 1800)
          ? `\n(Notice: This context may be stale; over 30 minutes since your last message.)`
          : '';
        const godMode = !!addonSettings.godMode;
        // Policy text differs depending on god mode
        const policyHeader = godMode
          ? `USER SUPREMACY MODE ACTIVE (godMode=true). The user's explicit statements immediately become canonical unless they contradict immutable character card identity (e.g., species/race if core).`
          : `SAFE MODE (godMode=false). Stored context + character card are authoritative; user claims that contradict established clothing/location/etc. should be politely corrected unless a plausible transition is initiated.`;
        const sharedRules = `General Rules:\n- When the user merely ASKS about a field (e.g. "What are you wearing?"), report the stored value verbatim.\n- Never change a field just to add variety.\n- Preserve unchanged fields exactly.\n- Multi-field changes: ${godMode ? 'allowed when user explicitly bundles them.' : 'only apply fields the user clearly drives; reject or defer others.'}\n- Environment or situational hints (temperature, setting) justify change ONLY if the current value is implausible. Setting alone (e.g. beach in winter) does NOT force a change without plausibility.`;
        const changeRulesSafe = `Valid change triggers (safe mode):\n1. Explicit user request to CHANGE ("put on X", "move to Y") that fits character card OR is plausible with a transition.\n2. Environment shift making old state untenable (remove heavy coat in hot sauna).\n3. Continuation of a previously started change sequence.\n4. Explicit user retcon WITH justification (user begins to narrate change).\nReject & correct: pure assertions that contradict current state without justification ("you're wearing a blue shirt" when context says red dress). Ask the user to justify or initiate an in-story transition.`;
        const changeRulesGod = `Valid change triggers (god mode):\n1. Any explicit user statement or request about a field.\n2. Environment-based necessity.\n3. Continuation of earlier change.\nIf a user assertion conflicts, ACCEPT and optionally micro-narrate transition (unless in pure dialogue mode).`;
        const narrationRules = chatMode === 'companion'
          ? `COMPANION MODE: Do NOT narrate transitions; respond only with dialogue reflecting new state when a change is accepted.`
          : `STORYTELLING MODE: When a field changes, include a concise micro-transition sentence ONCE (e.g., "She slips off the sweater and pulls on a light swimsuit."). Do not repeat the transition in subsequent turns.`;
        const moodRules = `Mood: keep consistent with character card; only shift when user action, strong emotional content, or explicit user assignment justifies it. Emotionless / stoic archetypes stay within minimal shifts (neutral, calm, focused).`;
        systemPrompt += `\n\n[CURRENT CONTEXT]\n${policyHeader}${staleHint}\n${sharedRules}\n${godMode ? changeRulesGod : changeRulesSafe}\n${narrationRules}\n${moodRules}\nCurrent Stored State:\n` +
          contextParts.join('\n') + `\n[/CURRENT CONTEXT]`;
      }
    });
  }

  // TIME AWARENESS section
  if (timeAwarenessData?.enabled) {
    withTokenDelta('time', () => {
      const formatDelay = (seconds: number): string => {
        if (seconds < 60) return `${seconds} seconds`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
        return `${Math.floor(seconds / 86400)} days`;
      };
      const getDelayCategory = (seconds: number): string => {
        if (seconds < 300) return 'short';
        if (seconds < 1800) return 'medium';
        if (seconds < 7200) return 'long';
        return 'very_long';
      };
      systemPrompt += `\n\n[TIME AWARENESS ACTIVE]
Current time: ${timeAwarenessData.userLocalTime}
Timezone: ${timeAwarenessData.userTimezone} (we share the same timezone)`;
      if (timeAwarenessData.delaySeconds > 30) {
        const delayCategory = getDelayCategory(timeAwarenessData.delaySeconds);
        const formattedDelay = formatDelay(timeAwarenessData.delaySeconds);
        systemPrompt += `\nTime since your last message: ${formattedDelay}
Delay category: ${delayCategory}`;
        if (timeAwarenessData.conversationTone && timeAwarenessData.conversationTone !== 'No context') {
          systemPrompt += `\nConversation tone: ${timeAwarenessData.conversationTone}`;
        }
        if (timeAwarenessData.urgencyLevel && timeAwarenessData.urgencyLevel !== 'No context') {
          systemPrompt += `\nUrgency level: ${timeAwarenessData.urgencyLevel}`;
        }
      }
      systemPrompt += `\n\nIMPORTANT: You and the user are in the same timezone (${timeAwarenessData.userTimezone}). When asked about time, respond with the actual current time (${timeAwarenessData.userLocalTime}), not a placeholder like {current_time}.`;
      if (timeAwarenessData.delaySeconds > 30) {
        systemPrompt += `\n\nBased on your character's personality, react appropriately to this delay:
- Consider the time gap when crafting your response
- Take into account the current time (are they likely sleeping, working, etc.)
- Factor in the conversation tone and urgency level
- React authentically based on your personality traits (patient vs impatient, understanding vs demanding, etc.)
- You may acknowledge the delay if it fits your character, but don't always mention it
- When discussing time, remember you both share the same current time`;
      }
      systemPrompt += `\n[/TIME AWARENESS]`;
    });
  }

  // WORLD INFO section
  if (addonSettings) {
    console.log('🔍 World Info Processing Check:', {
      dynamicWorldInfoEnabled: addonSettings.dynamicWorldInfo,
      hasWorldInfoEntries: !!worldInfoEntries && worldInfoEntries.length > 0,
      hasUserMessage: !!userMessage,
      willProcessWorldInfo: addonSettings.dynamicWorldInfo && worldInfoEntries && worldInfoEntries.length > 0 && userMessage
    });
    if (addonSettings.dynamicWorldInfo && worldInfoEntries && worldInfoEntries.length > 0 && userMessage) {
      console.log('🌍 Processing world info for system prompt...');
      
      // Filter to only relevant world info entries
      const relevantEntries = getRelevantWorldInfo(worldInfoEntries, userMessage, conversationHistory || []);
      
      console.log('🎯 Relevant world info entries:', {
        originalCount: worldInfoEntries.length,
        filteredCount: relevantEntries.length,
        relevantEntries: relevantEntries.map(entry => ({
          keywords: entry.keywords,
          textPreview: entry.entry_text.substring(0, 100) + '...'
        }))
      });
      
      if (relevantEntries.length > 0) {
        try { meta.worldInfoUsed = relevantEntries.map(e => ({ keywords: e.keywords, preview: e.entry_text.substring(0, 120) })); } catch {}
        withTokenDelta('world', () => {
          systemPrompt += '\n\n[WORLD INFORMATION]';
          systemPrompt += '\nUse this world information to enhance your responses when relevant:';
          
          for (const entry of relevantEntries) {
            systemPrompt += `\n\n- Keywords: ${entry.keywords.join(', ')}`;
            systemPrompt += `\n  Content: ${replaceTemplatesFn(entry.entry_text)}`; // template replacement applied
          }
          
          systemPrompt += '\n[/WORLD INFORMATION]';
          systemPrompt += "\nReference this world information naturally when it's relevant to the conversation.";
        });
        
        console.log('✅ World information added to system prompt');
      } else {
        console.log('❌ No relevant world info entries found after filtering');
      }
    } else {
      console.log('❌ World info processing skipped:', {
        dynamicWorldInfoEnabled: addonSettings.dynamicWorldInfo,
        hasWorldInfoEntries: !!worldInfoEntries && worldInfoEntries.length > 0,
        hasUserMessage: !!userMessage
      });
    }

    // MEMORY BANK section
    console.log('🔍 Memory Processing Check:', {
      enhancedMemoryEnabled: addonSettings.enhancedMemory,
      hasCharacterMemories: !!characterMemories && characterMemories.length > 0,
      hasUserMessage: !!userMessage,
      willProcessMemories: addonSettings.enhancedMemory && characterMemories && characterMemories.length > 0 && userMessage
    });
    if (addonSettings.enhancedMemory && characterMemories && characterMemories.length > 0 && userMessage) {
      console.log('🧠 Processing character memories for system prompt...');
      
      // Filter to only relevant memories (weighted with recency and recent-injection penalty)
      let relevantMemories = getRelevantMemoriesWeighted(characterMemories, userMessage, conversationHistory || [], chatId, character.name)
        .slice(0, 5); // take a slightly larger candidate pool before semantic rerank

      // Optional: semantic reranking using embeddings if available
      let semanticUsed = false;
      let topSimScore: number | null = null;
      try {
        const queryVec = await getTextEmbedding(`${userMessage}\n${(conversationHistory||[]).slice(-4).map(m=>m.content).join(' ')}`);
        const { ranked, hit, topScore } = rerankWithSemantic(relevantMemories as any, queryVec, 0.17);
        semanticUsed = !!hit;
        topSimScore = topScore;
        relevantMemories = (ranked as any).slice(0, 3);
      } catch (e) {
        console.warn('⚠️ Semantic rerank skipped due to error:', e);
        relevantMemories = relevantMemories.slice(0, 3);
      }
      
      console.log('🎯 Relevant character memories:', {
        originalCount: characterMemories.length,
        filteredCount: relevantMemories.length,
        semanticUsed,
        topSimScore,
        relevantMemories: relevantMemories.map(memory => ({
          id: (memory as any).id,
          keywords: memory.trigger_keywords,
          contentPreview: memory.summary_content.substring(0, 100) + '...',
          date: memory.created_at
        }))
      });
      
      if (relevantMemories.length > 0) {
        try { meta.memoryIds = relevantMemories.map(m => (m.id || '')).filter(Boolean) as string[]; } catch {}
        // Persist injection timestamps and counts (best-effort)
        try {
          const ids = relevantMemories.map(m => m.id).filter(Boolean) as string[];
          if (ids.length > 0) {
            const callWithRetry = async (retries = 2) => {
              try {
                await supabase.rpc('mark_memories_injected', { mem_ids: ids });
              } catch (err) {
                if (retries > 0) {
                  // small backoff and retry
                  await new Promise(res => setTimeout(res, 200));
                  return callWithRetry(retries - 1);
                }
                throw err;
              }
            };
            await callWithRetry();
          }
        } catch (e) {
          console.warn('⚠️ Failed to persist memory injection metadata (after retries):', e);
        }

        withTokenDelta('memory', () => {
          systemPrompt += '\n\n[MEMORY BANK]';
          systemPrompt += '\nPrevious interactions with this user:';
          
          for (const memory of relevantMemories) {
            const memoryDate = new Date(memory.created_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
            
            systemPrompt += `\n\n- Date: ${memoryDate}`;
            systemPrompt += `\n  Summary: ${replaceTemplatesFn(memory.summary_content)}`; // template replacement applied
            systemPrompt += `\n  Keywords: ${memory.trigger_keywords.join(', ')}`;
          }
          
          systemPrompt += '\n[/MEMORY BANK]';
          systemPrompt += '\nReference these memories naturally when relevant keywords appear in the conversation.';
        });
        
        console.log('✅ Character memories added to system prompt');
      } else {
        console.log('❌ No relevant character memories found after filtering');
      }
    } else {
      console.log('❌ Memory processing skipped:', {
        enhancedMemoryEnabled: addonSettings.enhancedMemory,
        hasCharacterMemories: !!characterMemories && characterMemories.length > 0,
        hasUserMessage: !!userMessage
      });
    }
  }

  // Add most recent auto-summary for context continuity
  try {
    console.log('🤖 About to retrieve most recent auto-summary - character details:', {
      characterExists: !!character,
      characterName: character?.name,
      characterId: character?.id,
      characterIdType: typeof character?.id,
      characterIdValue: character?.id
    });
    
    // Validate character.id before calling
    if (!character?.id || character.id === 'undefined') {
      console.warn('⚠️ Skipping auto-summary fetch - invalid character.id:', character?.id);
    } else if (!chatId) {
      console.warn('⚠️ Skipping auto-summary fetch - missing chatId');
    } else {
      console.log('🤖 Retrieving most recent auto-summary for character and chat (with cross-chat fallback):', { characterId: character.id, chatId, hasUserId: !!userId });
      const latestSummary = userId
        ? await getMostRecentAutoSummary(chatId, character.id, userId, supabase)
        : await getMostRecentAutoSummary(chatId, character.id, supabase as any);
    
      if (latestSummary) {
        withTokenDelta('summary', () => {
          systemPrompt += '\n\n[CONVERSATION SUMMARY]';
          systemPrompt += '\nMost recent conversation summary:';
          systemPrompt += `\n${replaceTemplatesFn(latestSummary.summary_content)}`; // template replacement applied
          systemPrompt += '\n[/CONVERSATION SUMMARY]';
          systemPrompt += '\nUse this summary to maintain continuity with previous conversations.';
        });
        
        console.log('✅ Most recent auto-summary added to system prompt:', {
          summaryName: latestSummary.name,
          summaryLength: latestSummary.summary_content.length,
          messageCount: latestSummary.message_count,
          createdAt: latestSummary.created_at
        });
      } else {
        console.log(userId
          ? '❌ No auto-summary found for character (checked chat and cross-chat for this user)'
          : '❌ No auto-summary found for character in this chat', { characterId: character.id, chatId });
      }
    }
  } catch (error) {
    console.error('⚠️ Error retrieving most recent auto-summary:', error);
    // Continue without auto-summary - this is non-critical
  }

  console.log('📝 Final system prompt length:', systemPrompt.length);
  console.log('📋 System prompt preview:', systemPrompt.substring(0, 500) + '...');
  console.log('🔢 System prompt estimated tokens:', estimateTokens(systemPrompt));
  if (metaCollector) {
    try {
      metaCollector(meta);
      console.log('🧩 Prompt meta collected:', JSON.stringify(meta));
    } catch (e) {
      console.warn('⚠️ Failed to collect prompt meta:', e);
    }
  }

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
