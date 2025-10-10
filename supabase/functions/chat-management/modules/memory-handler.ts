import { fetchConversationHistory, fetchCharacterData } from './database.ts';
import { getUserPlanAndModel, consumeCredits } from './billing.ts';
import { getLatestSummaryInfo } from './message-counter.ts';
import { normalizeKeywords, normalizeContentForHash, computeContentHash } from './memory-utils.ts';
import { safeLog, safeError } from '../../_shared/logging.ts';
import { generateMessageBasedSummary } from './auto-summary-new.ts';
import { upsertManualMemory } from './knowledge.ts';
/** Simple stable hash for content de-dup */ function hashString(input) {
  let hash = 5381;
  for(let i = 0; i < input.length; i++){
    hash = (hash << 5) + hash + input.charCodeAt(i); // hash * 33 + c
    hash = hash | 0; // 32-bit
  }
  // Convert to unsigned hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}
/**
 * Calculate estimated tokens for summarization
 */ function estimateTokenCost(messages) {
  const totalChars = messages.reduce((acc, msg)=>acc + (msg.content?.length || 0), 0);
  // Rough estimate: 1 token = ~4 characters
  return Math.ceil(totalChars / 4);
}
/**
 * Create date keywords for memory triggering
 */ function createDateKeywords() {
  const now = new Date();
  // Create specific date string (e.g., "2025-07-21")
  const specificDate = now.toISOString().split('T')[0];
  // Create readable date (e.g., "July 21, 2025")
  const readableDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  return [
    specificDate,
    readableDate
  ];
}
/**
 * Save or update memory in database
 */ async function saveCharacterMemory(userId, characterId, chatId, memoryData, supabase) {
  try {
    console.log('💾 Saving character memory to database...');
    await upsertManualMemory(supabase, {
      userId,
      characterId,
      chatId,
      content: memoryData.summary_content,
      keywords: memoryData.trigger_keywords,
      messageCount: memoryData.message_count,
      contentHash: memoryData.content_hash,
      metadata: {
        input_token_cost: memoryData.input_token_cost
      }
    });
    console.log('✅ Memory upsert complete');
    return true;
  } catch (error) {
    console.error('❌ Database error saving memory:', error);
    return false;
  }
}
/**
 * Main memory creation handler
 */ export async function handleCreateMemory(request, user, supabase, supabaseAdmin) {
  const startTime = Date.now();
  try {
    const { chatId, characterId } = request;
    if (!chatId || !characterId) {
      safeError('memory_missing_fields', new Error('missing'), {
        chatIdPresent: !!chatId,
        characterIdPresent: !!characterId
      });
      return {
        success: false,
        error: 'Missing required fields'
      };
    }
    safeLog('memory_create_start', {
      chatId,
      characterId,
      userId: user.id
    });
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
    safeLog('memory_messages_total', {
      chatId,
      count: messageHistory.length
    });
    // Get latest summary info to determine what messages to summarize
    const { lastSummaryEndMessage } = await getLatestSummaryInfo(chatId, supabase);
    // Filter to only unsummarized messages
    const unsummarizedMessages = messageHistory.filter((msg)=>msg.message_order > lastSummaryEndMessage);
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
      addonPercentage: 0,
      totalCost: creditCost
    };
    // Check and consume credits
    const hasCredits = await consumeCredits(user.id, creditInfo, supabase, supabaseAdmin);
    if (!hasCredits) {
      return {
        success: false,
        error: `Insufficient credits. Required: ${creditCost}`
      };
    }
    // Generate summary using the new message-based system
    const summaryData = await generateMessageBasedSummary(unsummarizedMessages, character, openRouterKey, undefined, user.id);
    if (!summaryData) {
      return {
        success: false,
        error: 'Failed to generate chat summary'
      };
    }
    // Compute AI sequence end for message_count standardization
    // Count AI messages in unsummarized range and add to lastSummaryEndMessage
    const aiMessagesInRange = unsummarizedMessages.filter((m)=>m.is_ai_message && !m.content.includes('[PLACEHOLDER]')).length;
    const aiSequenceStart = lastSummaryEndMessage + 1;
    const aiSequenceEnd = lastSummaryEndMessage + aiMessagesInRange;
    // Normalize content and keywords
    const normalizedContent = normalizeContentForHash(summaryData.content);
    const cleanedKeywords = normalizeKeywords([
      ...summaryData.keywords,
      ...createDateKeywords()
    ], character?.name);
    const contentHash = await computeContentHash(normalizedContent, chatId) || hashString(normalizedContent);
    const memoryData = {
      summary_content: normalizedContent,
      trigger_keywords: cleanedKeywords,
      message_count: aiSequenceEnd,
      input_token_cost: creditCost,
      content_hash: contentHash
    };
    // Save to database (always insert or update same chat row per legacy logic)
    const saveSuccess = await saveCharacterMemory(user.id, characterId, chatId, memoryData, supabase);
    if (!saveSuccess) {
      return {
        success: false,
        error: 'Failed to save memory'
      };
    }
    const endTime = Date.now();
    safeLog('manual_memory_created', {
      durationMs: endTime - startTime,
      chatId,
      characterId
    });
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
    const cId = request?.chatId;
    const chId = request?.characterId;
    safeError('memory_creation_error', error, {
      chatId: cId,
      characterId: chId
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    };
  }
}
