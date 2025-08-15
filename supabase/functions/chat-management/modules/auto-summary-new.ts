import type { SupabaseClient } from '../types/streaming-interfaces.ts';
import { normalizeKeywords, normalizeContentForHash, computeContentHash } from './memory-utils.ts';
import { getTextEmbedding } from './embeddings.ts';

/**
 * Message-Based Auto-Summary Module
 * Handles automatic conversation summarization every 15 AI responses
 * Note: Idempotency is enforced by unique index on (user_id, character_id, chat_id, message_count) where is_auto_summary=true
 */

const MISTRAL_MODEL = 'mistralai/mistral-small-3.2-24b-instruct';
const MAX_SUMMARY_TOKENS = 2500; // Increased significantly for longer summaries

// Global summary lock to prevent race conditions  
declare global {
  var summaryLocks: Map<string, Promise<SummaryResult>>;
}

if (!globalThis.summaryLocks) {
  globalThis.summaryLocks = new Map();
}

const summaryLocks = globalThis.summaryLocks;

export interface SummaryResult {
  success: boolean;
  summaryId?: string;
  title?: string;
  content?: string;
  keywords?: string[];
  messageCount?: number;
  messageRange?: string;
  error?: string;
  note?: string;
}

/**
 * Extract meaningful keywords from conversation messages
 */
function extractKeywordsFromMessages(messages: any[], characterName: string): string[] {
  const keywords = new Set<string>();
  
  // Extract from messages
  const allText = messages.map(m => m.content).join(' ').toLowerCase();
  
  // Common words to exclude
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'some',
    'few', 'more', 'most', 'other', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'then', 'there', 'here',
    'conversation', 'chat', 'talk', 'speaking', 'discussion', 'roleplay', 'character']);
  // Exclude the character's own name to avoid constant triggering
  if (characterName) stopWords.add(String(characterName).toLowerCase());
  
  // Extract meaningful words (3+ letters, not stop words)
  const words = allText.match(/\b[a-z]{3,}\b/g) || [];
  const wordFreq = new Map<string, number>();
  
  words.forEach(word => {
    if (!stopWords.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  });
  
  // Get top frequent words
  const sortedWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9)
    .map(([word]) => word);
  
  sortedWords.forEach(word => keywords.add(word));
  
  return Array.from(keywords).slice(0, 10);
}

/**
 * Generate auto-summary for message range
 */
export async function generateMessageBasedSummary(
  messagesToSummarize: any[],
  character: any,
  openRouterKey: string,
  previousSummary?: string
): Promise<{ title: string, content: string, keywords: string[] }> {
  if (!messagesToSummarize || messagesToSummarize.length === 0) {
    throw new Error('No messages to summarize');
  }

  // Build conversation text for summarization (compact speaker labels to avoid name spam)
  const conversationText = messagesToSummarize
    .sort((a, b) => a.message_order - b.message_order)
    .map(msg => {
      const speaker = msg.is_ai_message ? (character.name || 'Character') : 'User';
      return `${speaker}> ${msg.content}`; // single delimiter form helps reduce repetition in model output
    })
    .join('\n');

  // Calculate AI sequence range for display
  const aiMessagesInRange = messagesToSummarize.filter(m => m.is_ai_message);
  const rangeStart = (aiMessagesInRange.length > 0 && aiMessagesInRange[0].aiSequenceNumber)
    ? Math.min(...aiMessagesInRange.map(m => m.aiSequenceNumber).filter((n: number | null | undefined) => n != null) as number[])
    : 1;
  const rangeEnd = (aiMessagesInRange.length > 0 && aiMessagesInRange[0].aiSequenceNumber)
    ? Math.max(...aiMessagesInRange.map(m => m.aiSequenceNumber).filter((n: number | null | undefined) => n != null) as number[])
    : aiMessagesInRange.length;

  // Trim previous summary to avoid token bloat
  let prior = '';
  if (previousSummary) {
    const MAX_PRIOR_CHARS = 6000; // ~1500 tokens approx
    prior = previousSummary.slice(0, MAX_PRIOR_CHARS);
  }

  const hasPrior = !!prior;

  const summaryPrompt = `You are an expert long-term memory curator for an AI character. You will produce a CUMULATIVE conversation summary that integrates NEW messages into the existing narrative without restating unchanged background details.

STRICT OUTPUT: Return ONLY a single valid JSON object. NO backticks. NO extra commentary.

REPETITION RULES:
- Mention the character's name exactly once in the first sentence, then switch to pronouns or role descriptors.
- Do NOT repeatedly write "User"; use pronouns after first reference.
- Avoid re-listing unchanged facts already in prior summary unless they are directly modified.

GOALS:
1. Integrate new developments succinctly while preserving continuity.
2. Capture persistent facts worth remembering for future context.
3. Identify emotional / relational trajectory shifts.
4. Surface unresolved threads or goals.
5. Extract high-signal retrieval keywords (for future triggering) – no names of user or character.

${hasPrior ? `PRIOR_CUMULATIVE_SUMMARY (context only, do NOT copy verbatim; update it):\n${prior}\n` : 'NO PRIOR SUMMARY: create an initial comprehensive baseline.'}

NEW MESSAGES (AI range ${rangeStart}-${rangeEnd}):\n${conversationText}

REQUIRED JSON SHAPE:
{
  "title": "5-10 word descriptive snapshot (avoid repeating character name)",
  "summary": "3-5 paragraphs (400-650 words) cumulative narrative: 1) situational framing & continuity, 2) key new interactions & actions, 3) emotional + relational dynamics shifts, 4) newly revealed facts / world details & implications, 5) forward-looking hooks (merge with 4 if concise). No bullet lists inside paragraphs.",
  "new_developments": ["List ONLY novel events or changes introduced in this batch"],
  "facts_to_remember": ["Stable enduring facts that should persist beyond this scene"],
  "unresolved_threads": ["Outstanding goals, mysteries, tensions to monitor"],
  "emotional_dynamics": "1-2 sentences summarizing evolving emotional / relational state",
  "entities": {"people": ["(excluding user/character)"], "locations": [], "objects": [], "concepts": []},
  "keywords": ["8-12 lowercase trigger terms or short multi-word phrases (2-3 words) focusing on distinctive topics, objects, events, emotions, locations, unresolved plot hooks; exclude character & user names, exclude generic words like conversation, chat, talk, feelings, character, user."]
}

VALIDATION:
- Arrays may be empty but must exist.
- keywords length 8-12.
- No markdown code fences.
- Use double quotes only.
`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [
          { role: 'user', content: summaryPrompt }
        ],
        max_tokens: MAX_SUMMARY_TOKENS,
        temperature: 0.35
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();
    const summaryText = data?.choices?.[0]?.message?.content?.trim();

    if (!summaryText) {
      throw new Error('No summary content returned from API');
    }

    return parseSummaryResponse(summaryText, messagesToSummarize, character.name || 'Character');
    
  } catch (error) {
    console.error('Summary generation failed:', error);
    throw error;
  }
}

/**
 * FIXED: Parse AI summary response with better error handling
 */
function parseSummaryResponse(response: string, messages: any[], characterName: string): { title: string, content: string, keywords: string[] } {
  try {
    let cleanedResponse = response.trim();
    cleanedResponse = cleanedResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '');

    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}$/);
    if (!jsonMatch) throw new Error('No JSON structure found');

    const parsed: any = JSON.parse(jsonMatch[0]);

    if (parsed) {
      // Build enriched content
      let baseSummary = parsed.summary || parsed.cumulative_summary || '';
      const sections: string[] = [];
      if (parsed.new_developments?.length) sections.push('NEW DEVELOPMENTS:\n- ' + parsed.new_developments.join('\n- '));
      if (parsed.facts_to_remember?.length) sections.push('FACTS TO REMEMBER:\n- ' + parsed.facts_to_remember.join('\n- '));
      if (parsed.unresolved_threads?.length) sections.push('UNRESOLVED THREADS:\n- ' + parsed.unresolved_threads.join('\n- '));
      if (parsed.emotional_dynamics) sections.push('EMOTIONAL DYNAMICS: ' + parsed.emotional_dynamics);
      if (parsed.entities) {
        const entLines: string[] = [];
        for (const k of ['people','locations','objects','concepts']) {
          if (Array.isArray(parsed.entities[k]) && parsed.entities[k].length) entLines.push(`${k.toUpperCase()}: ${parsed.entities[k].join(', ')}`);
        }
        if (entLines.length) sections.push('ENTITIES:\n' + entLines.join('\n'));
      }
      const fullContent = [baseSummary.trim(), ...sections].filter(Boolean).join('\n\n');

      const cleanedRawKeywords: string[] = Array.isArray(parsed.keywords) ? parsed.keywords : [];
      const cleanKeywords = cleanedRawKeywords
        .map(k => (k || '').trim().toLowerCase())
        .filter(k => k && k !== String(characterName).toLowerCase() && k !== 'user' && k.length < 64)
        .slice(0, 12);

      return {
        title: parsed.title || `${characterName} Conversation Summary`,
        content: fullContent,
        keywords: cleanKeywords.length ? cleanKeywords : extractKeywordsFromMessages(messages, characterName)
      };
    }
  } catch (error) {
    console.warn('⚠️ Enhanced summary parse failed, falling back:', error instanceof Error ? error.message : error);
  }
  // fallback unchanged behavior
  const extractedKeywords = extractKeywordsFromMessages(messages, characterName);
  return {
    title: `${characterName} Conversation Summary`,
    content: response,
    keywords: extractedKeywords
  };
}

/**
 * Main function to trigger message-based summarization with race condition protection
 */
/**
 * Main function to trigger message-based summarization with race condition protection
 */
export async function triggerMessageBasedSummary(
  chatId: string,
  userId: string,
  characterId: string,
  messagesToSummarize: any[],
  character: any,
  openRouterKey: string,
  supabase: SupabaseClient,
  retryCount: number = 0
): Promise<SummaryResult> {
  const MAX_RETRIES = 3;
  const lockKey = `summary_${chatId}`;
  
  // CRITICAL FIX: Check if summary is already being processed for this chat
  if (summaryLocks.has(lockKey)) {
    try {
      const existingResult = await summaryLocks.get(lockKey)!;
      return existingResult;
    } catch (error) {
      return { success: false, error: 'Summary already in progress', note: 'Concurrent request' };
    }
  }
  
  // Create and store the summary promise to prevent concurrent summaries
  const summaryPromise = (async (): Promise<SummaryResult> => {
    try {
      // Check if we have messages to summarize
      if (!messagesToSummarize || messagesToSummarize.length === 0) {
        return { success: false, error: 'No messages to summarize' };
      }

      // Get the last summary info to calculate proper AI sequence
      const { data: summaries } = await supabase
        .from('character_memories')
        .select('message_count')
        .eq('chat_id', chatId)
        .eq('is_auto_summary', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      const lastSummaryEndMessage = summaries?.[0]?.message_count || 0;
      
      // Sort messages by order and calculate AI sequence numbers
      const sortedMessages = [...messagesToSummarize].sort((a, b) => a.message_order - b.message_order);
      
      // FIXED: Calculate AI sequence numbers correctly
      let globalAiSequence = lastSummaryEndMessage; // Start from last summary
      const aiMessagesInRange: any[] = [];
      
      for (const msg of sortedMessages) {
        if (msg.is_ai_message && !msg.content.includes('[PLACEHOLDER]')) {
          globalAiSequence++;
          aiMessagesInRange.push({
            ...msg,
            aiSequenceNumber: globalAiSequence
          });
        }
      }
      
      if (aiMessagesInRange.length === 0) {
        return { success: false, error: 'No AI messages to summarize' };
      }
      
      // Calculate correct range
      const aiSequenceStart = lastSummaryEndMessage + 1;
      const aiSequenceEnd = globalAiSequence; // This is now the actual last AI message number
      const rangeString = `${aiSequenceStart}-${aiSequenceEnd}`;

      // Check if a summary already exists for this exact range
      const { data: existingSummary } = await supabase
        .from('character_memories')
        .select('id, message_count, created_at, name')
        .eq('chat_id', chatId)
        .eq('character_id', characterId)
        .eq('is_auto_summary', true)
        .eq('message_count', aiSequenceEnd)
        .maybeSingle();
      
      if (existingSummary) {
        return { 
          success: true, 
          summaryId: existingSummary.id, 
          messageRange: rangeString,
          note: 'Summary already exists' 
        };
      }

      // Add AI sequence numbers to all messages for proper range calculation
      sortedMessages.forEach(msg => {
        const aiMatch = aiMessagesInRange.find(ai => ai.id === msg.id);
        if (aiMatch) {
          msg.aiSequenceNumber = aiMatch.aiSequenceNumber;
        }
      });

      // Generate summary
      // Fetch previous summary content (if any) for cumulative context
      let previousSummaryContent: string | undefined;
      try {
        const { data: prev } = await supabase
          .from('character_memories')
          .select('summary_content')
            .eq('chat_id', chatId)
            .eq('character_id', characterId)
            .eq('is_auto_summary', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        previousSummaryContent = prev?.summary_content;
      } catch {}

      const summaryData = await generateMessageBasedSummary(
        sortedMessages,
        character,
        openRouterKey,
        previousSummaryContent
      );

      if (!summaryData) {
        throw new Error('Failed to generate summary');
      }

      // Normalize and hash summary content for de-duplication
      const normalizedContent = normalizeContentForHash(summaryData.content);
      let contentHash = await computeContentHash(normalizedContent);

      const fullTitle = `Conversation Summary - ${new Date().toLocaleDateString()} (AI: ${rangeString})`;

      // Normalize keywords
      const cleanedKeywords = normalizeKeywords(summaryData.keywords, character?.name);

      // CRITICAL FIX: Upsert using unique content_hash per chat for auto-summaries
      const insertPayload: any = {
        user_id: userId,
        character_id: characterId,
        chat_id: chatId,
        name: fullTitle,
        summary_content: normalizedContent,
        trigger_keywords: cleanedKeywords,
        message_count: aiSequenceEnd,
        input_token_cost: 0,
        is_auto_summary: true,
        content_hash: contentHash
      };

      // Use insert-select with ON CONFLICT emulation via two-step approach for supabase-js
      let data, saveError;
      try {
        const result = await supabase
          .from('character_memories')
          .insert(insertPayload)
          .select()
          .single();
        data = result.data;
        saveError = result.error;
      } catch (e) {
        saveError = e;
      }

      // If unique conflict (hash or range), resolve to existing row and update
      if (saveError && (saveError.code === '23505' || ('' + saveError.message).includes('uq_auto_summary_content_hash_per_chat') || ('' + saveError.message).includes('uq_auto_summary_range') || ('' + saveError.message).includes('uq_auto_summary_range_explicit'))) {
        // Try by content_hash first
        let existingId: string | undefined;
        if (contentHash) {
          const { data: existingByHash } = await supabase
            .from('character_memories')
            .select('id')
            .eq('chat_id', chatId)
            .eq('is_auto_summary', true)
            .eq('content_hash', contentHash)
            .maybeSingle();
          existingId = existingByHash?.id;
        }
        // Fallback by range end
        if (!existingId) {
          const { data: existingByRange } = await supabase
            .from('character_memories')
            .select('id')
            .eq('chat_id', chatId)
            .eq('is_auto_summary', true)
            .eq('message_count', aiSequenceEnd)
            .maybeSingle();
          existingId = existingByRange?.id;
        }

        if (existingId) {
          const upd = await supabase
            .from('character_memories')
            .update({
              name: fullTitle,
              summary_content: normalizedContent,
              trigger_keywords: cleanedKeywords,
              message_count: aiSequenceEnd,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingId)
            .select()
            .single();
          data = upd.data;
          saveError = upd.error;
        }
      }

      if (saveError) {
        console.error('❌ Failed to save auto-summary (dedupe):', saveError);
        throw saveError;
      }

      // Best-effort: set explicit AI sequence range if columns exist
      try {
        if (data?.id) {
          await supabase
            .from('character_memories')
            .update({ ai_sequence_start: aiSequenceStart as any, ai_sequence_end: aiSequenceEnd as any })
            .eq('id', data.id);

          // Optional: compute and store embedding
          const vec = await getTextEmbedding(normalizedContent);
          if (vec && Array.isArray(vec)) {
            await supabase
              .from('character_memories')
              .update({ embedding: vec as any })
              .eq('id', data.id);
          }
        }
      } catch (e) {
        console.warn('⚠️ Optional ai_sequence_* or embedding update skipped:', e?.message || e);
      }

      return {
        success: true,
        summaryId: data.id,
        title: summaryData.title,
        content: normalizedContent,
        keywords: cleanedKeywords,
        messageCount: aiSequenceEnd,
        messageRange: rangeString
      };
      
    } catch (error) {
      console.error(`Auto-summary failed (attempt ${retryCount + 1}):`, error);
      
      // Retry logic
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Remove the lock before retrying
        summaryLocks.delete(lockKey);
        return triggerMessageBasedSummary(
          chatId, userId, characterId, messagesToSummarize, character, 
          openRouterKey, supabase, retryCount + 1
        );
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  })();
  
  // Store the promise in the lock map
  summaryLocks.set(lockKey, summaryPromise);
  
  // Clean up the lock when promise completes (success or failure)
  summaryPromise.finally(() => {
    setTimeout(() => {
      summaryLocks.delete(lockKey);
    }, 2000); // 2 second delay to handle rapid successive calls
  });
  
  return summaryPromise;
}

/**
 * Restore the exported helper to fetch most recent auto-summary used by message-handler.
 */
export async function getMostRecentAutoSummary(
  chatId: string,
  characterId: string,
  userOrSupabase: string | SupabaseClient,
  maybeSupabase?: SupabaseClient
): Promise<any> {
  // Backward compatibility: old signature was (chatId, characterId, supabase)
  const userId = typeof userOrSupabase === 'string' ? userOrSupabase : undefined;
  const supabase = (maybeSupabase || (userOrSupabase as any)) as SupabaseClient;

  try {
    // Try current chat first (and user if provided)
    let query = supabase
      .from('character_memories')
      .select('*')
      .eq('chat_id', chatId)
      .eq('character_id', characterId)
      .eq('is_auto_summary', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (userId) {
      query = supabase
        .from('character_memories')
        .select('*')
        .eq('chat_id', chatId)
        .eq('character_id', characterId)
        .eq('user_id', userId)
        .eq('is_auto_summary', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    const { data: inChat, error } = await query;
    if (error) {
      console.error('Error fetching recent auto-summary (chat-scoped):', error);
    }
    if (inChat) return inChat;

    // Fallback: most recent across chats for this user-character
    if (userId) {
      const { data: across, error: fbErr } = await supabase
        .from('character_memories')
        .select('*')
        .eq('character_id', characterId)
        .eq('user_id', userId)
        .eq('is_auto_summary', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fbErr) {
        console.error('Error fetching cross-chat auto-summary (user-scoped):', fbErr);
        return null;
      }
      return across || null;
    }

    // Final fallback (no userId provided): keep old behavior (none across chats to avoid leakage)
    return null;
  } catch (error) {
    console.error('Failed to get recent auto-summary:', error);
    return null;
  }
}
