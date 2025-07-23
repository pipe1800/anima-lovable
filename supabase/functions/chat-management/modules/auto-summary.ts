/**
 * Message-Based Auto-Summary Module
 * Handles automatic conversation summarization every 15 AI responses
 */

const MISTRAL_MODEL = 'mistralai/mistral-7b-instruct';
const MAX_SUMMARY_TOKENS = 1500; // Increased for more detailed summaries (3-4 paragraphs)

export interface SummaryResult {
  success: boolean;
  summaryId?: string;
  title?: string;
  content?: string;
  keywords?: string[];
  messageCount?: number;
  messageRange?: string;
  error?: string;
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

  const rangeStart = Math.min(...messagesToSummarize.map(m => m.message_order));
  const rangeEnd = Math.max(...messagesToSummarize.map(m => m.message_order));

  const summaryPrompt = `You are an expert conversation summarizer. Create a comprehensive summary of this roleplay conversation.

CHARACTER: ${character.name || 'Character'}
PERSONALITY: ${character.personality_summary || 'Not specified'}
MESSAGE RANGE: ${rangeStart}-${rangeEnd}

CONVERSATION TO SUMMARIZE:
${conversationText}

Create a detailed JSON summary with these exact fields:
{
  "title": "Brief descriptive title (max 50 chars)",
  "summary": "Comprehensive 3-4 paragraph summary covering key events, character development, relationship dynamics, and emotional moments. Be specific about actions, dialogue, and plot points.",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Requirements:
- Summary should be 3-4 detailed paragraphs
- Include specific dialogue and actions that happened
- Capture character emotions and relationship changes
- Keywords should be relevant for memory retrieval
- Focus on continuity for future roleplay`;

  console.log('🤖 Generating message-based summary:', {
    messagesCount: messagesToSummarize.length,
    rangeStart,
    rangeEnd,
    characterName: character.name,
    conversationLength: conversationText.length
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
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        max_tokens: MAX_SUMMARY_TOKENS,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Summary generation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const summaryText = data.choices?.[0]?.message?.content?.trim();
    
    if (!summaryText) {
      throw new Error('No summary content received');
    }

    console.log('✅ Raw summary generated:', {
      length: summaryText.length,
      preview: summaryText.substring(0, 200) + '...'
    });

    // Parse JSON response
    try {
      const summaryData = JSON.parse(summaryText);
      
      // Validate required fields
      if (!summaryData.title || !summaryData.summary) {
        throw new Error('Missing required fields in summary');
      }

      // Ensure keywords is an array
      const keywords = Array.isArray(summaryData.keywords) 
        ? summaryData.keywords 
        : ['roleplay', 'conversation', 'character'];

      return {
        title: summaryData.title.substring(0, 50), // Enforce title limit
        content: summaryData.summary,
        keywords: keywords.filter(k => typeof k === 'string' && k.trim().length > 0).slice(0, 10)
      };
      
    } catch (parseError) {
      console.error('Failed to parse summary JSON:', parseError);
      
      // Fallback: create basic summary from raw text
      const now = new Date();
      return {
        title: `Conversation Summary - ${now.toLocaleDateString()}`,
        content: summaryText,
        keywords: ['conversation', 'roleplay', character.name || 'character']
      };
    }
    
  } catch (error) {
    console.error('Summary generation failed:', error);
    throw error;
  }
}
      messagesToKeep.unshift(msg); // Add to beginning to maintain order
      recentTokenCount += msgTokens;
    } else {
      break;
    }
  }
  
  // Everything else gets summarized
  const messagesToSummarize = messages.slice(0, messages.length - messagesToKeep.length);
  const summaryTokenCount = messagesToSummarize.reduce((total, msg) => 
    total + estimateTokens(msg.content || ''), 0
  );
  
  console.log(`📊 Summary calculation: ${messagesToSummarize.length} messages (${summaryTokenCount} tokens) to summarize, ${messagesToKeep.length} messages (${recentTokenCount} tokens) to keep`);
  
  return {
    messagesToSummarize,
    messagesToKeep,
    summaryTokenCount,
    recentTokenCount
  };
}

/**
 * Generate auto-summary using Mistral-7B
 */
export async function generateAutoSummary(
  messages: any[],
  character: any,
  openRouterKey: string
): Promise<{ title: string, content: string, keywords: string[] }> {
  if (!messages.length) {
    throw new Error('No messages to summarize');
  }
  
  // Build conversation text
  const conversationText = messages.map(msg => {
    const role = msg.is_ai_message ? character.name : 'User';
    return `${role}: ${msg.content}`;
  }).join('\n\n');
  
  // Create summarization prompt
  const summaryPrompt = `You are an expert conversation summarizer. Your task is to create a comprehensive summary of this roleplay conversation.

CONVERSATION TO SUMMARIZE:
${conversationText}

Please provide:
1. A SHORT TITLE (max 50 characters) that captures the main theme
2. A DETAILED SUMMARY (2-3 paragraphs) covering key events, character development, and important decisions
3. KEYWORDS (5-10 words) for key topics, locations, events, or other characters mentioned (exclude the main user and character names)

Format your response as JSON:
{
  "title": "Brief title here",
  "summary": "Detailed 2-3 paragraph summary here...",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Focus on preserving important narrative elements, character growth, and plot developments that future conversations might reference.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': globalThis.Deno?.env?.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'Anima-AutoSummary'
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        temperature: 0.3, // Low temperature for consistent summaries
        max_tokens: MAX_SUMMARY_TOKENS,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const summaryText = data.choices?.[0]?.message?.content;
    
    if (!summaryText) {
      throw new Error('Empty summary response from AI');
    }

    // Parse JSON response
    try {
      const summaryData = JSON.parse(summaryText);
      
      // Validate required fields
      if (!summaryData.title || !summaryData.summary || !summaryData.keywords) {
        throw new Error('Invalid summary format - missing required fields');
      }
      
      // Ensure keywords is an array and limit to 10
      const keywords = Array.isArray(summaryData.keywords) 
        ? summaryData.keywords.slice(0, 10)
        : [summaryData.keywords].slice(0, 10);
      
      return {
        title: summaryData.title.substring(0, 50), // Enforce title limit
        content: summaryData.summary,
        keywords: keywords.filter(k => typeof k === 'string' && k.trim().length > 0)
      };
      
    } catch (parseError) {
      console.error('Failed to parse summary JSON:', parseError);
      
      // Fallback: create basic summary from raw text
      const now = new Date();
      return {
        title: `Conversation Summary - ${now.toLocaleDateString()}`,
        content: summaryText,
        keywords: ['conversation', 'roleplay']
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
export async function saveAutoSummary(
  summaryData: { title: string, content: string, keywords: string[] },
  userId: string,
  characterId: string,
  chatId: string,
  messageCount: number,
  supabase: SupabaseClient
): Promise<string> {
  const now = new Date();
  const formattedDate = now.toLocaleString();
  const fullTitle = `${summaryData.title} - ${formattedDate}`;
  
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
        message_count: messageCount,
        input_token_cost: 0, // Free operation
        is_auto_summary: true
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to save auto-summary:', error);
      throw error;
    }

    console.log(`✅ Auto-summary saved: "${fullTitle}" (${messageCount} messages)`);
    
    // Dispatch success event for UI notification
    if (typeof globalThis !== 'undefined' && globalThis.dispatchEvent) {
      const event = new CustomEvent('autoSummarySuccess', {
        detail: {
          summaryId: data.id,
          title: fullTitle,
          messageCount: messageCount
        }
      });
      globalThis.dispatchEvent(event);
    }
    
    return data.id;
    
  } catch (error) {
    console.error('Error saving auto-summary:', error);
    throw error;
  }
}

/**
 * Trigger background summarization process
 */
export async function triggerBackgroundSummary(
  chatId: string,
  userId: string,
  characterId: string,
  messages: any[],
  character: any,
  openRouterKey: string,
  supabase: SupabaseClient,
  retryCount: number = 0
): Promise<SummaryResult> {
  const MAX_RETRIES = 3;
  const requestId = crypto.randomUUID();
  
  console.log(`🚨 DUPLICATE CALL TRACKER: triggerBackgroundSummary called`, {
    requestId,
    chatId,
    characterId,
    retryCount,
    timestamp: new Date().toISOString(),
    messagesLength: messages.length,
    callStack: new Error().stack?.split('\n').slice(0, 8)
  });
  
  try {
    console.log(`🧠 Starting auto-summary for chat ${chatId} (attempt ${retryCount + 1}) [${requestId}]`);
    
    // CRITICAL: Check if a summary already exists for this chat to prevent duplicates
    console.log('🔍 Checking for existing auto-summary...');
    const { data: existingSummary } = await supabase
      .from('character_memories')
      .select('id, created_at')
      .eq('chat_id', chatId)
      .eq('character_id', characterId)
      .eq('is_auto_summary', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (existingSummary) {
      const summaryAge = Date.now() - new Date(existingSummary.created_at).getTime();
      const oneHourInMs = 60 * 60 * 1000;
      
      if (summaryAge < oneHourInMs) {
        console.log('⚠️ Auto-summary already exists (created recently), skipping generation', {
          existingSummaryId: existingSummary.id,
          ageMinutes: Math.round(summaryAge / (60 * 1000)),
          createdAt: existingSummary.created_at
        });
        return { 
          success: true, 
          summaryId: existingSummary.id,
          error: 'Summary already exists - skipped duplicate'
        };
      } else {
        console.log('📝 Existing summary is old, creating new one');
      }
    }
    
    // Calculate what to summarize
    const { messagesToSummarize } = calculateMessagesToSummarize(messages);
    
    if (messagesToSummarize.length === 0) {
      return { success: false, error: 'No messages to summarize' };
    }
    
    // Generate summary
    const summaryData = await generateAutoSummary(messagesToSummarize, character, openRouterKey);
    
    // Save to database
    const summaryId = await saveAutoSummary(
      summaryData,
      userId,
      characterId,
      chatId,
      messagesToSummarize.length,
      supabase
    );
    
    return {
      success: true,
      summaryId,
      title: summaryData.title,
      content: summaryData.content,
      keywords: summaryData.keywords,
      messageCount: messagesToSummarize.length
    };
    
  } catch (error) {
    console.error(`❌ Auto-summary failed (attempt ${retryCount + 1}):`, error);
    
    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`🔄 Retrying auto-summary in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return triggerBackgroundSummary(
        chatId, userId, characterId, messages, character, 
        openRouterKey, supabase, retryCount + 1
      );
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get the latest auto-summary for a chat
 */
export async function getLatestAutoSummary(
  chatId: string,
  characterId: string,
  supabase: SupabaseClient
): Promise<{ name: string, summary_content: string } | null> {
  try {
    const { data, error } = await supabase
      .from('character_memories')
      .select('name, summary_content')
      .eq('chat_id', chatId)
      .eq('character_id', characterId)
      .eq('is_auto_summary', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching latest auto-summary:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to get latest auto-summary:', error);
    return null;
  }
}
