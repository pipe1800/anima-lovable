/**
 * Message-based auto-summarization and token management
 * New system: Auto-summary every 15 AI responses, context preserved with recent messages
 */

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MessageHistoryItem {
  content: string;
  is_ai_message: boolean;
  created_at: string;
  message_order: number;
  id: string;
}

export interface ConversationResult {
  messages: ConversationMessage[];
  truncated: boolean;
  totalTokens: number;
  droppedMessages: number;
  needsSummarization: boolean;
  currentAiMessageCount: number;
  nextSummaryAt: number;
  tokenBreakdown: {
    system: number;
    history: number;
    currentMessage: number;
    remaining: number;
  };
}

export interface SummaryTriggerInfo {
  shouldTriggerSummary: boolean;
  currentAiCount: number;
  nextSummaryAt: number;
  lastSummaryEndMessage: number;
  messagesToSummarize: MessageHistoryItem[];
}

/**
 * Estimate token count for text using cl100k_base approximation
 * This provides a reasonable estimate for most OpenAI and compatible models
 * Updated to be more accurate for our use case
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // More accurate estimation based on real-world testing
  // Average is ~0.75 tokens/word for English, but varies significantly
  const words = text.trim().split(/\s+/).length;
  const characters = text.length;
  
  // Use character-based estimation as fallback
  let estimatedTokens = Math.ceil(characters / 4); // ~4 characters per token average
  
  // Word-based estimation (often more accurate for regular text)
  const wordBasedTokens = Math.ceil(words * 1.3); // More conservative multiplier
  
  // Use the higher estimate to be safe
  estimatedTokens = Math.max(estimatedTokens, wordBasedTokens);
  
  // Adjust for content type
  if (text.includes('{') || text.includes('[')) {
    estimatedTokens = Math.ceil(estimatedTokens * 1.2); // JSON/structured content
  }
  
  if (text.includes('```') || text.includes('<')) {
    estimatedTokens = Math.ceil(estimatedTokens * 1.15); // Code or markup
  }
  
  return estimatedTokens;
}

/**
 * Count AI messages in message history
 */
export function countAiMessages(messageHistory: MessageHistoryItem[]): number {
  return messageHistory.filter(msg => msg.is_ai_message && !msg.content.includes('[PLACEHOLDER]')).length;
}

/**
 * Get the latest summary information for a chat
 */
export async function getLatestSummaryInfo(chatId: string, supabase: any): Promise<{
  lastSummaryEndMessage: number;
  hasSummaries: boolean;
}> {
  try {
    const { data: summaries, error } = await supabase
      .from('character_memories')
      .select('message_count')
      .eq('chat_id', chatId)
      .eq('is_auto_summary', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching summary info:', error);
      return { lastSummaryEndMessage: 0, hasSummaries: false };
    }

    if (!summaries || summaries.length === 0) {
      return { lastSummaryEndMessage: 0, hasSummaries: false };
    }

    return {
      lastSummaryEndMessage: summaries[0].message_count,
      hasSummaries: true
    };
  } catch (error) {
    console.error('Failed to get summary info:', error);
    return { lastSummaryEndMessage: 0, hasSummaries: false };
  }
}

/**
 * Determine if auto-summary should trigger based on AI message count
 */
export async function checkSummaryTrigger(
  chatId: string,
  messageHistory: MessageHistoryItem[],
  supabase: any
): Promise<SummaryTriggerInfo> {
  const SUMMARY_INTERVAL = 15; // Every 15 AI responses
  
  // Get latest summary information
  const { lastSummaryEndMessage } = await getLatestSummaryInfo(chatId, supabase);
  
  // Count AI messages since last summary (or from beginning if no summaries)
  const aiMessagesAfterSummary = messageHistory.filter(msg => 
    msg.is_ai_message && 
    !msg.content.includes('[PLACEHOLDER]') &&
    msg.message_order > lastSummaryEndMessage
  );
  
  const currentAiCount = aiMessagesAfterSummary.length;
  const nextSummaryAt = lastSummaryEndMessage + SUMMARY_INTERVAL;
  const shouldTriggerSummary = currentAiCount >= SUMMARY_INTERVAL;
  
  // If triggering summary, get messages to summarize
  let messagesToSummarize: MessageHistoryItem[] = [];
  if (shouldTriggerSummary) {
    // Get the messages from lastSummaryEndMessage+1 to the current 15th AI message
    const targetAiMessages = aiMessagesAfterSummary.slice(0, SUMMARY_INTERVAL);
    const lastAiMessageOrder = targetAiMessages[targetAiMessages.length - 1]?.message_order || 0;
    
    // Get all messages (user + AI) in the range to summarize
    messagesToSummarize = messageHistory.filter(msg => 
      msg.message_order > lastSummaryEndMessage && 
      msg.message_order <= lastAiMessageOrder
    );
  }
  
  console.log('📊 Summary Trigger Check:', {
    chatId,
    lastSummaryEndMessage,
    currentAiCount,
    targetInterval: SUMMARY_INTERVAL,
    nextSummaryAt,
    shouldTriggerSummary,
    messagesToSummarizeCount: messagesToSummarize.length,
    decision: shouldTriggerSummary ? '🚨 TRIGGER AUTO-SUMMARY' : '✅ No summary needed'
  });
  
  return {
    shouldTriggerSummary,
    currentAiCount,
    nextSummaryAt,
    lastSummaryEndMessage,
    messagesToSummarize
  };
}
  estimatedTokens = Math.max(estimatedTokens, wordBasedTokens);
  
  // Adjust for content type
  if (text.includes('{') || text.includes('[')) {
    estimatedTokens = Math.ceil(estimatedTokens * 1.2); // JSON/structured content
  }
  
  if (text.includes('```') || text.includes('<')) {
    estimatedTokens = Math.ceil(estimatedTokens * 1.15); // Code or markup
  }
  
  return estimatedTokens;
}

/**
 * Calculate total tokens for an array of conversation messages
 */
export function calculateMessageTokens(messages: ConversationMessage[]): number {
  return messages.reduce((total, msg) => {
    // Add small overhead for role labels and formatting
    const contentTokens = estimateTokens(msg.content);
    const roleTokens = 3; // Approximate tokens for role formatting
    return total + contentTokens + roleTokens;
  }, 0);
}

/**
 * Token budget allocation structure
 */
export interface TokenBudget {
  totalBudget: number;           // Model's max context window
  systemPromptTokens: number;    // Base system prompt + character + context
  contextTokens: number;         // World info + memories + addons
  messageHistoryBudget: number;  // Available tokens for message history
  warningThreshold: number;      // When to show context ceiling warning
  safetyMargin: number;         // Reserved tokens for response generation
}

/**
 * Calculate token budget allocation for a chat session
 * Updated for Universal 12k Context System
 */
export function calculateTokenBudget(
  maxContextTokens: number,
  systemPrompt: string,
  worldInfo: string = '',
  memories: string = '',
  currentContext: string = '',
  autoSummary: string = ''
): TokenBudget {
  const systemPromptTokens = estimateTokens(systemPrompt);
  const contextTokens = estimateTokens(worldInfo + memories + currentContext + autoSummary);
  
  // Reserve tokens for:
  // - Safety margin: 10% of total (for unexpected overhead)
  // - Response generation: ~500 tokens
  const safetyMargin = Math.max(
    Math.ceil(maxContextTokens * 0.1), 
    500
  );
  
  const messageHistoryBudget = Math.max(
    0, 
    maxContextTokens - systemPromptTokens - contextTokens - safetyMargin
  );
  
  return {
    totalBudget: maxContextTokens,
    systemPromptTokens,
    contextTokens,
    messageHistoryBudget,
    warningThreshold: Math.floor(maxContextTokens * 0.9),
    safetyMargin
  };
}

/**
 * Build conversation messages within token budget, with truncation and auto-summary triggering
 */
export function buildConversationMessagesWithTokenBudget(
  systemPrompt: string,
  messageHistory: MessageHistoryItem[],
  userMessage: string,
  maxContextTokens: number = 12000
): ConversationResult {
  // Auto-summaries are handled in the system prompt building phase
  // New chats won't have summaries and that's perfectly normal
  const autoSummaryContent = '';
  const finalSystemPrompt = systemPrompt;

  const systemPromptTokens = estimateTokens(finalSystemPrompt);
  const userMessageTokens = estimateTokens(userMessage);

  // Reserve a safety margin for the AI's response
  const safetyMargin = 1000;
  const messageHistoryBudget = maxContextTokens - systemPromptTokens - userMessageTokens - safetyMargin;

  // Calculate the ORIGINAL total tokens for ALL messages (before truncation)
  let originalHistoryTokens = 0;
  for (const message of messageHistory) {
    const content = message.content || '';
    originalHistoryTokens += estimateTokens(content);
  }
  const originalTotalTokens = systemPromptTokens + originalHistoryTokens + userMessageTokens;

  const historyToInclude: ConversationMessage[] = [];
  let historyTokens = 0;
  let truncated = false;
  let droppedMessages = 0;

  // Iterate backwards from the most recent message
  for (let i = messageHistory.length - 1; i >= 0; i--) {
    const message = messageHistory[i];
    const content = message.content || '';
    const messageTokens = estimateTokens(content);

    if (historyTokens + messageTokens <= messageHistoryBudget) {
      historyTokens += messageTokens;
      historyToInclude.unshift({
        role: message.is_ai_message ? 'assistant' : 'user',
        content: content,
      });
    } else {
      truncated = true;
      droppedMessages = i + 1;
      break; // Stop when the budget is exceeded
    }
  }

  const finalMessages: ConversationMessage[] = [
    { role: 'system', content: finalSystemPrompt },
    ...historyToInclude,
    { role: 'user', content: userMessage },
  ];

  const totalTokens = systemPromptTokens + historyTokens + userMessageTokens;
  
  // Trigger summarization based on ORIGINAL total tokens (all history + new message)
  // This ensures we trigger when the full conversation reaches 12k, regardless of truncation
  const needsSummarization = originalTotalTokens >= 12000;

  console.log('🎯 Auto-Summary Decision:', {
    originalTotalTokens,
    truncatedTotalTokens: totalTokens,
    maxContextTokens,
    summaryThreshold: 12000,
    needsSummarization,
    exceedsThresholdBy: Math.max(0, originalTotalTokens - 12000),
    truncated,
    droppedMessages,
    decision: needsSummarization ? '🚨 TRIGGER AUTO-SUMMARY' : '✅ No summary needed',
    triggerReason: needsSummarization ? 'original conversation exceeds 12k tokens' : 'under 12k tokens'
  });

  return {
    messages: finalMessages,
    truncated,
    totalTokens,
    droppedMessages,
    needsSummarization,
    tokenBreakdown: {
      system: systemPromptTokens,
      history: historyTokens,
      currentMessage: userMessageTokens,
      remaining: maxContextTokens - totalTokens,
    },
  };
}

/**
 * Log token usage for monitoring and debugging
 */
export function logTokenUsage(
  chatId: string,
  modelId: string,
  totalTokens: number,
  maxTokens: number,
  breakdown: any
) {
  const percentUsed = Math.round((totalTokens / maxTokens) * 100);
  
  console.log('🎯 Token Budget Analysis:', {
    chatId,
    model: modelId,
    usage: {
      totalTokens,
      maxTokens,
      percentUsed: `${percentUsed}%`,
      remaining: maxTokens - totalTokens
    },
    breakdown: {
      systemPrompt: breakdown.system,
      messageHistory: breakdown.history,
      currentMessage: breakdown.currentMessage,
      safetyMargin: breakdown.remaining
    },
    status: percentUsed > 90 ? '⚠️ HIGH' : percentUsed > 70 ? '🟡 MEDIUM' : '🟢 LOW'
  });
}
