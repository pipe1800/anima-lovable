import type { SupabaseClient } from '../types/streaming-interfaces.ts';

/**
 * Message-Based Auto-Summary Module
 * Handles automatic conversation summarization every 5 AI responses (changed for testing)
 */

const MISTRAL_MODEL = 'mistralai/mistral-7b-instruct';
const MAX_SUMMARY_TOKENS = 2500; // Increased significantly for longer summaries

// Global summary lock to prevent race conditions  
const summaryLocks = new Map<string, Promise<SummaryResult>>();

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
 * Generate auto-summary for message range
 */
export async function generateMessageBasedSummary(
  messagesToSummarize: any[],
  character: any,
  openRouterKey: string
): Promise<{ title: string, content: string, keywords: string[] }> {
  if (!messagesToSummarize || messagesToSummarize.length === 0) {
    throw new Error('No messages to summarize');
  }

  // Build conversation text for summarization
  const conversationText = messagesToSummarize
    .sort((a, b) => a.message_order - b.message_order)
    .map(msg => {
      const speaker = msg.is_ai_message ? character.name || 'Character' : 'User';
      return `${speaker}: ${msg.content}`;
    })
    .join('\n\n');

  // FIXED: Calculate range based on AI sequence numbers, not message_order
  const aiMessagesInRange = messagesToSummarize.filter(m => m.is_ai_message);
  
  let rangeStart: number, rangeEnd: number;
  
  if (aiMessagesInRange.length > 0 && aiMessagesInRange[0].aiSequenceNumber) {
    // Use the actual AI sequence numbers for accurate range
    const sequenceNumbers = aiMessagesInRange.map(m => m.aiSequenceNumber).filter(n => n != null);
    rangeStart = Math.min(...sequenceNumbers);
    rangeEnd = Math.max(...sequenceNumbers);
  } else {
    // Fallback: Use simple counting based on AI message position
    console.warn('⚠️ AI sequence numbers not available, using position-based counting');
    const aiCount = aiMessagesInRange.length;
    rangeStart = 1; // Default start
    rangeEnd = aiCount; // Use count of AI messages
  }

  console.log('📊 FIXED Range Calculation for Prompt:', {
    totalMessages: messagesToSummarize.length,
    aiMessagesInRange: aiMessagesInRange.length,
    aiSequenceNumbers: aiMessagesInRange.map(m => m.aiSequenceNumber),
    calculatedRange: `${rangeStart}-${rangeEnd}`,
    messageOrderRange: `${Math.min(...messagesToSummarize.map(m => m.message_order))}-${Math.max(...messagesToSummarize.map(m => m.message_order))}`,
    usingSequenceRange: `${rangeStart}-${rangeEnd}`
  });

  const summaryPrompt = `You are an expert conversation summarizer. Create a comprehensive summary of this roleplay conversation.

CHARACTER: ${character.name || 'Character'}
PERSONALITY: ${character.personality_summary || 'Not specified'}
AI MESSAGE SEQUENCE: ${rangeStart}-${rangeEnd} (covering ${aiMessagesInRange.length} AI responses)

CONVERSATION TO SUMMARIZE:
${conversationText}

Create a detailed JSON summary with these exact fields:
{
  "title": "Brief descriptive title (max 50 chars)",
  "summary": "EXACTLY 4 detailed paragraphs separated by double line breaks. Each paragraph must be at least 3-4 sentences long. Cover: (1) Initial interactions and setup, (2) Key dialogue and character development, (3) Relationship dynamics and emotional moments, (4) Recent developments and current state. Be very specific about actions, dialogue, and plot points.",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

CRITICAL REQUIREMENTS:
- Summary MUST be exactly 4 paragraphs (each 3-4 sentences minimum)  
- Each paragraph separated by double line breaks (\\n\\n)
- Include specific dialogue quotes and actions
- Capture character emotions and relationship evolution
- Keywords MUST be 5 specific terms from the conversation (names, objects, places, activities, emotions)
- Keywords should be extracted directly from the conversation content
- Return ONLY valid JSON, no additional text

EXAMPLE KEYWORDS: ["${character.name || 'Character'}", "emotion_word", "location_or_object", "activity", "relationship_term"]
- Focus on continuity for future roleplay
- Be detailed and comprehensive, not brief
- Minimum 500 words in the summary field`;

  console.log('🤖 Generating message-based summary:', {
    messagesCount: messagesToSummarize.length,
    rangeStart,
    rangeEnd,
    estimatedTokens: Math.ceil(conversationText.length / 4),
    tokenLimit: MAX_SUMMARY_TOKENS
  });

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
        temperature: 0.3 // Lower temperature for consistent formatting
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const summaryText = data.choices?.[0]?.message?.content?.trim();

    if (!summaryText) {
      throw new Error('No summary content returned from API');
    }

    console.log('📝 Generated summary response:', {
      model: MISTRAL_MODEL,
      tokensUsed: data.usage?.total_tokens || 'unknown',
      preview: summaryText.substring(0, 200) + '...'
    });

    // Parse JSON response
    try {
      const summaryData = JSON.parse(summaryText);
      
      // Validate required fields
      if (!summaryData.title || !summaryData.summary) {
        throw new Error('Missing required fields in summary');
      }

      // Ensure keywords is an array and extract properly
      let keywords: string[] = [];
      if (Array.isArray(summaryData.keywords)) {
        keywords = summaryData.keywords.filter(k => typeof k === 'string' && k.trim().length > 0);
      } else {
        // Try to extract keywords from the conversation if not provided
        const conversationLower = conversationText.toLowerCase();
        const characterName = character.name || 'character';
        keywords = [characterName.toLowerCase()];
        
        // Add common roleplay keywords found in conversation
        const commonKeywords = ['relationship', 'conversation', 'interaction', 'emotion', 'dialogue'];
        keywords = keywords.concat(commonKeywords.filter(k => conversationLower.includes(k)));
      }
      
      // Ensure at least 3 keywords, max 10
      if (keywords.length < 3) {
        keywords = [...keywords, 'roleplay', 'conversation', 'character'].slice(0, 5);
      }

      return {
        title: summaryData.title.substring(0, 50), // Enforce title limit
        content: summaryData.summary,
        keywords: keywords.slice(0, 10) // Max 10 keywords
      };
      
    } catch (parseError) {
      console.error('Failed to parse summary JSON:', parseError);
      console.log('Raw response:', summaryText);
      
      // Fallback: create basic summary from raw text
      const now = new Date();
      return {
        title: `Conversation Summary - ${now.toLocaleDateString()}`,
        content: summaryText,
        keywords: [character.name || 'character', 'conversation', 'roleplay']
      };
    }
    
  } catch (error) {
    console.error('Summary generation failed:', error);
    throw error;
  }
}

/**
 * Save auto-summary to character_memories table
 */
export async function saveMessageBasedSummary(
  summaryData: { title: string, content: string, keywords: string[] },
  userId: string,
  characterId: string,
  chatId: string,
  messagesToSummarize: any[],
  supabase: SupabaseClient
): Promise<string> {
  // FIXED: Calculate range based on AI sequence numbers, not message_order
  const aiMessagesInRange = messagesToSummarize.filter(m => m.is_ai_message);
  
  // Use AI sequence numbers if available, otherwise calculate from position
  let rangeStart: number, rangeEnd: number;
  
  if (aiMessagesInRange.length > 0 && aiMessagesInRange[0].aiSequenceNumber) {
    // Use the actual AI sequence numbers for accurate range
    const sequenceNumbers = aiMessagesInRange.map(m => m.aiSequenceNumber).filter(n => n != null);
    rangeStart = Math.min(...sequenceNumbers);
    rangeEnd = Math.max(...sequenceNumbers);
  } else {
    // Fallback: Use simple counting based on AI message position  
    console.warn('⚠️ AI sequence numbers not available for save, using position-based counting');
    rangeStart = 1;
    rangeEnd = aiMessagesInRange.length;
  }
    
  // FIXED: Title shows actual AI message sequence range
  const fullTitle = `${summaryData.title} (AI: ${rangeStart}-${rangeEnd})`;
  
  console.log('💾 FIXED Auto-summary save with AI sequence numbers:', {
    title: fullTitle,
    aiSequenceRange: `${rangeStart}-${rangeEnd}`,
    totalMessagesInRange: messagesToSummarize.length,
    aiMessagesInRange: aiMessagesInRange.length,
    aiSequenceNumbers: aiMessagesInRange.map(m => m.aiSequenceNumber),
    contentLength: summaryData.content.length,
    keywords: summaryData.keywords
  });

  try {
    const { data, error } = await supabase
      .from('character_memories')
      .insert({
        user_id: userId,
        character_id: characterId,
        chat_id: chatId,
        name: fullTitle,
        summary_content: summaryData.content,
        trigger_keywords: summaryData.keywords,
        is_auto_summary: true,
        message_count: rangeEnd, // Store the ending AI sequence number
        input_token_cost: 0
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Failed to save auto-summary:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    if (!data?.id) {
      throw new Error('No summary ID returned from database');
    }

    console.log('✅ Auto-summary saved successfully:', {
      summaryId: data.id,
      title: fullTitle,
      messageRange: `${rangeStart}-${rangeEnd}`,
      keywordCount: summaryData.keywords.length
    });

    return data.id;
    
  } catch (error) {
    console.error('❌ Failed to save message-based summary:', error);
    throw error;
  }
}

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
  const requestId = crypto.randomUUID();
  const lockKey = `${chatId}-${characterId}`;
  
  console.log(`🧠 Starting message-based auto-summary for chat ${chatId} (attempt ${retryCount + 1}) [${requestId}]`, {
    messagesToSummarizeCount: messagesToSummarize.length,
    characterId,
    retryCount,
    lockKey
  });
  
  // CRITICAL FIX: Check if summary is already being processed for this chat
  if (summaryLocks.has(lockKey)) {
    console.log(`🔒 Summary already in progress for chat ${chatId}, waiting for completion...`);
    try {
      const existingResult = await summaryLocks.get(lockKey)!;
      console.log(`✅ Waited for existing summary completion:`, existingResult);
      return existingResult;
    } catch (error) {
      console.log(`⚠️ Previous summary failed, proceeding with new attempt:`, error);
      summaryLocks.delete(lockKey); // Clean up failed lock
    }
  }
  
  // Create and store the summary promise to prevent concurrent summaries
  const summaryPromise = (async (): Promise<SummaryResult> => {
    try {
      // Check if we have messages to summarize
      if (!messagesToSummarize || messagesToSummarize.length === 0) {
        return { success: false, error: 'No messages to summarize' };
      }

      // Calculate AI sequence range for duplicate checking
      const aiMessages = messagesToSummarize.filter(m => m.is_ai_message);
      let rangeEnd: number;
      
      if (aiMessages.length > 0 && aiMessages[0].aiSequenceNumber) {
        const sequenceNumbers = aiMessages.map(m => m.aiSequenceNumber).filter(n => n != null);
        rangeEnd = Math.max(...sequenceNumbers);
      } else {
        // Fallback to using message order (not ideal but safe)
        rangeEnd = Math.max(...messagesToSummarize.map(m => m.message_order));
      }
      
      // Check if a summary already exists for this range
      console.log('🔍 Checking for existing summary in range...');
      const { data: existingSummary } = await supabase
        .from('character_memories')
        .select('id, message_count, created_at, name')
        .eq('chat_id', chatId)
        .eq('character_id', characterId)
        .eq('is_auto_summary', true)
        .eq('message_count', rangeEnd)
        .maybeSingle();
      
      if (existingSummary) {
        console.log('⚠️ Auto-summary already exists for this range, skipping', {
          existingSummaryId: existingSummary.id,
          existingTitle: existingSummary.name,
          messageCount: existingSummary.message_count,
          createdAt: existingSummary.created_at
        });
        return { 
          success: true, 
          summaryId: existingSummary.id, 
          messageRange: `range-${rangeEnd}`,
          note: 'Summary already exists' 
        };
      }

      // Generate the summary
      console.log('🤖 Generating new summary...');
      const summaryData = await generateMessageBasedSummary(
        messagesToSummarize,
        character,
        openRouterKey
      );

      // Save the summary
      console.log('💾 Saving summary to database...');
      const summaryId = await saveMessageBasedSummary(
        summaryData,
        userId,
        characterId,
        chatId,
        messagesToSummarize,
        supabase
      );
      
      const finalRange = `${rangeEnd - 4}-${rangeEnd}`; // Assuming 5 messages interval
      
      return {
        success: true,
        summaryId,
        title: summaryData.title,
        content: summaryData.content,
        keywords: summaryData.keywords,
        messageCount: rangeEnd,
        messageRange: finalRange
      };
      
    } catch (error) {
      console.error(`❌ Message-based auto-summary failed (attempt ${retryCount + 1}):`, error);
      
      // Retry logic
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 Retrying message-based auto-summary in 2 seconds...`);
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
    summaryLocks.delete(lockKey);
    console.log(`🔓 Released summary lock for ${lockKey} [${requestId}]`);
  });
  
  return summaryPromise;
}

/**
 * Get the most recent auto-summary for building context
 */
export async function getMostRecentAutoSummary(
  chatId: string,
  characterId: string,
  supabase: SupabaseClient
): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('character_memories')
      .select('*')
      .eq('chat_id', chatId)
      .eq('character_id', characterId)
      .eq('is_auto_summary', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching recent auto-summary:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to get recent auto-summary:', error);
    return null;
  }
}
