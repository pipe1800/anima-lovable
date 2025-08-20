import { 
  fetchConversationHistory,
  fetchCharacterData
} from './database.ts';
import {
  getUserPlanAndModel,
  consumeCredits 
} from './billing.ts';
import { getLatestSummaryInfo } from './message-counter.ts';
import { generateMessageBasedSummary } from './auto-summary-new.ts';
import { normalizeKeywords, normalizeContentForHash, computeContentHash } from './memory-utils.ts';
import { safeLog, safeError } from '../../_shared/logging.ts';

import type { CreateMemoryRequest, ChatResponse } from '../types/index.ts';

/** Simple stable hash for content de-dup */
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i); // hash * 33 + c
    hash = hash | 0; // 32-bit
  }
  // Convert to unsigned hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Enhanced Memory Handler - Create Manual Chat Summaries
 * 
 * Updated for message-based system: Only summarizes messages NOT already in summaries
 */

interface MemoryData {
  summary_content: string;
  trigger_keywords: string[];
  message_count: number;
  input_token_cost: number;
  content_hash?: string;
}

/**
 * Calculate estimated tokens for summarization
 */
function estimateTokenCost(messages: any[]): number {
  const totalChars = messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0);
  // Rough estimate: 1 token = ~4 characters
  return Math.ceil(totalChars / 4);
}

/**
 * Create date keywords for memory triggering
 */
function createDateKeywords(): string[] {
  const now = new Date();
  
  // Create specific date string (e.g., "2025-07-21")
  const specificDate = now.toISOString().split('T')[0];
  
  // Create readable date (e.g., "July 21, 2025")
  const readableDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return [specificDate, readableDate];
}

/**
 * Generate chat summary using Mistral Small 3.2 24B Instruct
 */
async function generateChatSummary(
  messages: any[],
  character: any,
  openRouterKey: string
): Promise<{ summary: string; keywords: string[] } | null> {
  // Basic validation & sanitization
  if (!Array.isArray(messages)) {
    throw new Error('Invalid messages payload');
  }
  // Enforce max messages and per-message length to prevent prompt injection / token blow-up
  const MAX_MESSAGES = 120; // safeguard
  const MAX_MSG_CHARS = 1200;
  const SAFE_CONTENT_REGEX = /[\u0000-\u001F]/g; // control chars to strip
  const sanitized = messages.slice(0, MAX_MESSAGES).map(m => ({
    ...m,
    content: String(m?.content || '')
      .replace(SAFE_CONTENT_REGEX, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_MSG_CHARS)
  }));
  messages = sanitized;

  const conversationText = messages
    .map(msg => `${msg.is_ai_message ? character.name || 'Character' : 'User'}: ${msg.content}`)
    .join('\n');

  const summaryPrompt = `You are creating a memory summary of a conversation between a user and a character named ${character.name || 'the character'}.

CONVERSATION:
${conversationText}

Create a comprehensive summary (1-2 paragraphs) that captures:
1. Key events and topics discussed
2. Important character development or relationship changes  
3. Significant details that should be remembered for future conversations
4. The overall tone and context of the interaction

Then extract EXACTLY 5 specific keywords that could trigger this memory in future conversations. Keywords should be:
- Specific names, places, objects, or unique concepts mentioned
- Important emotional states or relationship dynamics
- Key activities or events that occurred
- Specific topics of conversation (not generic terms)
- Unique details that make this conversation memorable

AVOID generic keywords like "conversation", "chat", "talk", "friend", "relationship".
FOCUS on specific, unique elements from this particular interaction.

Respond in this exact JSON format:
{
  "summary": "Your 1-2 paragraph summary here...",
  "keywords": ["specific_keyword1", "specific_keyword2", "specific_keyword3", "specific_keyword4", "specific_keyword5"]
}`;

  try {
    console.log('🤖 Generating chat summary with Mistral Small 3.2 24B...');
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': globalThis.Deno?.env?.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-MemorySummary'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-small-3.2-24b-instruct',
        messages: [
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      console.error('❌ Mistral API Error:', response.status, response.statusText);
      return null;
    }

  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
    
    console.log('📝 Raw summary response:', content);

    // Parse JSON response
    try {
      const cleanedContent = content.trim()
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '');
      
      const parsed = JSON.parse(cleanedContent);
      
      if (parsed.summary && Array.isArray(parsed.keywords)) {
        // Filter out generic keywords
        const genericKeywords = [
          'conversation', 'chat', 'talk', 'speaking', 'discussion',
          'friend', 'friendship', 'relationship', 'meeting', 'interaction',
          'question', 'answer', 'response', 'dialogue', 'communication',
          'today', 'yesterday', 'day', 'time', 'moment'
        ];
        // Also exclude common names: character and user
        const charName = String(character.name || '').toLowerCase();
        const possibleUserNames = [
          String((character as any)?.userName || '').toLowerCase(),
          'user'
        ].filter(Boolean);
         
        const filteredKeywords = parsed.keywords
          .filter((keyword: string) => {
            const lowerKeyword = keyword.toLowerCase();
            const isGeneric = genericKeywords.some(generic => lowerKeyword.includes(generic) || generic.includes(lowerKeyword));
            const isCharName = charName && (lowerKeyword === charName || lowerKeyword.includes(charName));
            const isUserName = possibleUserNames.some(n => n && (lowerKeyword === n || lowerKeyword.includes(n)));
            return !(isGeneric || isCharName || isUserName);
          })
          .slice(0, 5); // Ensure exactly 5 keywords max

        // Fallback: ensure non-empty keywords array with at least one hash if filtering removed all
        if (filteredKeywords.length === 0) {
          filteredKeywords.push(hashString(conversationText).slice(0,6));
        }
        
        console.log('✅ Successfully parsed summary and keywords');
        console.log('🔍 Filtered keywords:', filteredKeywords);
        
        return {
          summary: parsed.summary,
          keywords: filteredKeywords
        };
      }
    } catch (parseError) {
      console.error('❌ Failed to parse summary JSON:', parseError);
    }

    return null;
  } catch (error) {
    console.error('❌ Chat summary generation error:', error);
    return null;
  }
}

/**
 * Save or update memory in database
 */
async function saveCharacterMemory(
  userId: string,
  characterId: string,
  chatId: string,
  memoryData: MemoryData,
  supabase: any
): Promise<boolean> {
  try {
    console.log('💾 Saving character memory to database...');
    
    // Check if memory already exists for this chat
    const { data: existingMemory } = await supabase
      .from('character_memories')
      .select('id')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .eq('chat_id', chatId)
      .maybeSingle();

    if (existingMemory) {
      // Update existing memory
      const { error } = await supabase
        .from('character_memories')
        .update({
          summary_content: memoryData.summary_content,
          trigger_keywords: memoryData.trigger_keywords,
          message_count: memoryData.message_count,
          input_token_cost: memoryData.input_token_cost,
          content_hash: memoryData.content_hash,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingMemory.id);

      if (error) {
        console.error('❌ Error updating memory:', error);
        return false;
      }
      
      console.log('✅ Updated existing memory');
    } else {
      // Create new memory
      const { error } = await supabase
        .from('character_memories')
        .insert({
          user_id: userId,
          character_id: characterId,
          chat_id: chatId,
          summary_content: memoryData.summary_content,
          trigger_keywords: memoryData.trigger_keywords,
          message_count: memoryData.message_count,
          input_token_cost: memoryData.input_token_cost,
          content_hash: memoryData.content_hash
        });

      if (error) {
        console.error('❌ Error creating memory:', error);
        return false;
      }
      
      console.log('✅ Created new memory');
    }

    return true;
  } catch (error) {
    console.error('❌ Database error saving memory:', error);
    return false;
  }
}

/**
 * Main memory creation handler
 */
export async function handleCreateMemory(
  request: CreateMemoryRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<ChatResponse> {
  const startTime = Date.now();
  
  try {
    const { chatId, characterId } = request;

    if (!chatId || !characterId) {
      safeError('memory_missing_fields', new Error('missing'), { chatIdPresent: !!chatId, characterIdPresent: !!characterId });
      return {
        success: false,
        error: 'Missing required fields'
      };
    }
    safeLog('memory_create_start', { chatId, characterId, userId: user.id });

    // Get OpenRouter API key
    const openRouterKey = globalThis.Deno?.env?.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      return {
        success: false,
        error: 'OpenRouter API key not configured'
      };
    }

    // Fetch required data
    const [character, messageHistory, planAndModel] = await Promise.all([
      fetchCharacterData(characterId, supabaseAdmin),
      fetchConversationHistory(chatId, supabase),
      getUserPlanAndModel(user.id, supabaseAdmin)
    ]);

    if (!character) {
      return {
        success: false,
        error: 'Character not found'
      };
    }

    if (!messageHistory || messageHistory.length === 0) {
      return {
        success: false,
        error: 'No messages to summarize'
      };
    }

  safeLog('memory_messages_total', { chatId, count: messageHistory.length });

    // Get latest summary info to determine what messages to summarize
    const { lastSummaryEndMessage } = await getLatestSummaryInfo(chatId, supabase);
    
    // Filter to only unsummarized messages
    const unsummarizedMessages = messageHistory.filter(msg => 
      msg.message_order > lastSummaryEndMessage
    );

    if (unsummarizedMessages.length === 0) {
      return {
        success: false,
        error: 'No new messages to summarize - all messages are already covered by existing summaries'
      };
    }

  safeLog('manual_memory_scope', {
      totalMessages: messageHistory.length,
      lastSummaryEndMessage,
      unsummarizedMessages: unsummarizedMessages.length,
      messageRange: `${unsummarizedMessages[0]?.message_order || 0}-${unsummarizedMessages[unsummarizedMessages.length - 1]?.message_order || 0}`
    });

    // Calculate token cost based on unsummarized messages only
    const estimatedTokens = estimateTokenCost(unsummarizedMessages);
    
    // New credit calculation: 5 credits per 300 tokens, minimum 5 credits
    const creditCost = Math.max(5, Math.ceil(estimatedTokens / 300) * 5);

  safeLog('memory_creation_cost', {
      estimatedTokens,
      creditCost,
      formula: 'max(5, ceil(tokens/300) * 5)'
    });

    // Create proper credit info for memory creation
    const creditInfo = {
      baseCost: creditCost,
      addonPercentage: 0, // Memory creation is a flat cost based on tokens
      totalCost: creditCost
    };

    // Check and consume credits
    const hasCredits = await consumeCredits(user.id, creditInfo, supabaseAdmin);
    
    if (!hasCredits) {
      return {
        success: false,
        error: `Insufficient credits. Required: ${creditCost}`
      };
    }

    // Generate summary using the new message-based system
    const summaryData = await generateMessageBasedSummary(
      unsummarizedMessages, 
      character, 
  openRouterKey,
  undefined,
  user.id
    );
    
    if (!summaryData) {
      return {
        success: false,
        error: 'Failed to generate chat summary'
      };
    }

    // Compute AI sequence end for message_count standardization
    // Count AI messages in unsummarized range and add to lastSummaryEndMessage
    const aiMessagesInRange = unsummarizedMessages
      .filter(m => m.is_ai_message && !m.content.includes('[PLACEHOLDER]'))
      .length;
    const aiSequenceStart = lastSummaryEndMessage + 1;
    const aiSequenceEnd = lastSummaryEndMessage + aiMessagesInRange;

    // Normalize content and keywords
    const normalizedContent = normalizeContentForHash(summaryData.content);
    const cleanedKeywords = normalizeKeywords([...summaryData.keywords, ...createDateKeywords()], character?.name);
  const contentHash = await computeContentHash(normalizedContent, chatId);

    const memoryData: MemoryData = {
      summary_content: normalizedContent,
      trigger_keywords: cleanedKeywords,
      message_count: aiSequenceEnd, // Standardized: AI sequence end
      input_token_cost: creditCost,
  content_hash: (await computeContentHash(normalizedContent, chatId)) || hashString(normalizedContent)
    };

    // Save to database (always insert or update same chat row per legacy logic)
    const saveSuccess = await saveCharacterMemory(
      user.id,
      characterId,
      chatId,
      memoryData,
      supabase
    );

    if (!saveSuccess) {
      return {
        success: false,
        error: 'Failed to save memory'
      };
    }

    const endTime = Date.now();
  safeLog('manual_memory_created', { durationMs: endTime - startTime, chatId, characterId });

    return {
      success: true,
      data: {
        message: 'Manual memory created successfully',
        summary: normalizedContent,
        title: summaryData.title,
        keywords: cleanedKeywords,
        messageCount: unsummarizedMessages.length,
        messageRange: `${unsummarizedMessages[0]?.message_order || 0}-${aiSequenceEnd}`,
        creditCost: creditCost
      }
    };

  } catch (error) {
    // Extract identifiers safely for logging
    const cId = (request as any)?.chatId;
    const chId = (request as any)?.characterId;
    safeError('memory_creation_error', error, { chatId: cId, characterId: chId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    };
  }
}
