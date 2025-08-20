/**
 * Message-based auto-summarization and token management
 * New system: Auto-summary every 5 AI responses (changed for testing), context preserved with recent messages
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
  aiSequenceNumber?: number; // For proper range calculation in summaries
}

export interface ConversationResult {
  messages: ConversationMessage[];
  truncated: boolean;
  totalTokens: number;
  droppedMessages: number;
  needsSummarization: boolean;
  currentAiMessageCount: number;
  nextSummaryAt: number;
  messagesToSummarize: MessageHistoryItem[];
  tokenBreakdown: {
    system: number;
    history: number;
    currentMessage: number;
    remaining: number;
  };
  diagnostics?: {
    tokenSavingsAgainstGreedyHistory: number; // Positive numbers mean we used fewer tokens than a greedy history baseline
    baseline: {
      historyTokens: number;
      totalTokens: number;
    };
  };
}

export interface SummaryTriggerInfo {
  shouldTriggerSummary: boolean;
  currentAiCount: number;
  nextSummaryAt: number;
  lastSummaryEndMessage: number;
  messagesToSummarize: MessageHistoryItem[];
  lockPrevented?: boolean;
}

export interface ConversationKnobs {
  maxPairs?: number; // default 5
  historyTokenLimit?: number; // default 8000
  safetyMarginTokens?: number; // default 0, remove oldest history to keep at least this many tokens free
  greedyBaseline?: {
    maxPairs?: number; // default 10
    historyTokenLimit?: number; // default 12000
  };
}

/**
 * Estimate token count for text using cl100k_base approximation
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
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
    // Fetch the latest message_count across ALL summaries (manual and auto)
    const { data: summaries, error } = await supabase
      .from('character_memories')
      .select('message_count')
      .eq('chat_id', chatId)
      .order('message_count', { ascending: false })
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
  const lockKey = `summary_${chatId}`;
  
  // CRITICAL FIX: Check if summary is already being processed for this chat
  // Import summaryLocks from auto-summary-new.ts if available
  if (typeof globalThis !== 'undefined' && 
      (globalThis as any).summaryLocks && 
      (globalThis as any).summaryLocks.has(lockKey)) {
    console.log(`🔒 Summary lock detected for chat ${chatId}, skipping trigger check`);
    return {
      shouldTriggerSummary: false,
      currentAiCount: 0,
      nextSummaryAt: 0,
      lastSummaryEndMessage: 0,
      messagesToSummarize: [],
      lockPrevented: true
    };
  }
  
  // Get latest summary information
  const { lastSummaryEndMessage } = await getLatestSummaryInfo(chatId, supabase);
  
  // Count ALL AI messages in the chat first to get total AI sequence
  let totalAiSequence = 0;
  const allAiMessages: MessageHistoryItem[] = [];
  
  for (const msg of messageHistory) {
    if (msg.is_ai_message && !msg.content.includes('[PLACEHOLDER]')) {
      totalAiSequence++;
      allAiMessages.push({
        ...msg,
        aiSequenceNumber: totalAiSequence
      });
    }
  }
  
  // Count AI messages since last summary
  const aiMessagesAfterSummary = allAiMessages.filter(msg => 
    (msg.aiSequenceNumber as number) > lastSummaryEndMessage
  );
  
  const currentAiCount = aiMessagesAfterSummary.length;
  const nextSummaryAt = lastSummaryEndMessage + SUMMARY_INTERVAL;
  
  // CRITICAL FIX: Only trigger on EXACT interval count, not >= 
  // This prevents triggering on messages 16, 17, 18, etc.
  const shouldTriggerSummary = totalAiSequence === nextSummaryAt;
  
  // If triggering summary, get messages to summarize
  let messagesToSummarize: MessageHistoryItem[] = [];
  if (shouldTriggerSummary) {
    // Get exactly the SUMMARY_INTERVAL AI messages that triggered the summary
    const targetAiMessages = aiMessagesAfterSummary.slice(0, SUMMARY_INTERVAL);
    
    if (targetAiMessages.length > 0) {
      const firstAiMessageOrder = targetAiMessages[0]?.message_order || 0;
      const lastAiMessageOrder = targetAiMessages[targetAiMessages.length - 1]?.message_order || 0;
      
      // Get all messages (user + AI) between first and last AI message in the range
      messagesToSummarize = messageHistory.filter(msg => 
        msg.message_order >= firstAiMessageOrder && 
        msg.message_order <= lastAiMessageOrder
      );
      
      // CRITICAL FIX: Add AI sequence numbers for proper title generation
      // lastSummaryEndMessage is the AI sequence number of the last summarized AI message
      const aiSequenceStart = lastSummaryEndMessage + 1; // Next AI sequence after last summary
      const aiSequenceEnd = aiSequenceStart + SUMMARY_INTERVAL - 1;
      
      // Add sequence metadata to messages for proper range calculation
      targetAiMessages.forEach((aiMsg, index) => {
        aiMsg.aiSequenceNumber = aiSequenceStart + index;
      });
      
      // Also add to all messages in range for consistency
      messagesToSummarize.forEach(msg => {
        if (msg.is_ai_message) {
          const aiIndex = targetAiMessages.findIndex(ai => ai.id === msg.id);
          if (aiIndex >= 0) {
            msg.aiSequenceNumber = aiSequenceStart + aiIndex;
          }
        }
      });
    }
  }
  
  return {
    shouldTriggerSummary,
    currentAiCount,
    nextSummaryAt,
    lastSummaryEndMessage,
    messagesToSummarize
  };
}

/**
 * Get the most recent message pairs for context
 * Parameterized: limit pairs and respect a token budget
 */
export function getRecentMessagePairs(
  messageHistory: MessageHistoryItem[],
  maxTokens: number = 12000,
  maxPairs: number = 5
): MessageHistoryItem[] {
  // Sort messages by order (most recent first)
  const sortedMessages = [...messageHistory].sort((a, b) => b.message_order - a.message_order);
  
  const recentMessages: MessageHistoryItem[] = [];
  let currentTokens = 0;
  let pairCount = 0;
  const MAX_PAIRS = Math.max(1, maxPairs);
  
  // Collect exactly K pairs (user + AI response), not all messages
  let i = 0;
  while (i < sortedMessages.length && pairCount < MAX_PAIRS) {
    const message = sortedMessages[i];
    const messageTokens = estimateTokens(message.content);
    
    // Check token limit before adding
    if (currentTokens + messageTokens > maxTokens) {
      console.log(`🚫 Token limit reached at ${currentTokens + messageTokens} tokens, stopping at ${pairCount} pairs`);
      break;
    }
    
    // Add message to context
    recentMessages.unshift(message); // Add to beginning to maintain chronological order
    currentTokens += messageTokens;
    
    // If this is an AI message, look for the preceding user message to complete the pair
    if (message.is_ai_message) {
      // Find the user message that this AI message responds to
      let userMessage: MessageHistoryItem | null = null;
      for (let j = i + 1; j < sortedMessages.length; j++) {
        if (!sortedMessages[j].is_ai_message && sortedMessages[j].message_order < message.message_order) {
          userMessage = sortedMessages[j];
          break;
        }
      }
      
      // Add the user message if found and within token budget
      if (userMessage) {
        const userTokens = estimateTokens(userMessage.content);
        if (currentTokens + userTokens <= maxTokens) {
          // Check if we already have this user message
          if (!recentMessages.find(m => m.id === userMessage!.id)) {
            recentMessages.unshift(userMessage);
            currentTokens += userTokens;
          }
        }
      }
      
      pairCount++;
    }
    
    i++;
  }
  
  // Re-sort messages in chronological order
  recentMessages.sort((a, b) => a.message_order - b.message_order);
  
  // REPLACED verbose log with trace-level concise version
  if ((globalThis as any).logger?.isTrace?.()) {
    (globalThis as any).logger.trace('history.recentPairs', { totalMessages: messageHistory.length, included: recentMessages.length, pairs: pairCount, tokens: currentTokens, maxTokens, maxPairs });
  } else {
    console.log; // no-op placeholder to avoid linter removal of import side-effects
  }
  return recentMessages;
}

/**
 * Build conversation messages with new message-based system
 */
export async function buildConversationMessagesWithMessageBudget(
  systemPrompt: string,
  messageHistory: MessageHistoryItem[],
  userMessage: string,
  maxContextTokens: number,
  chatId: string,
  supabase: any,
  knobs: ConversationKnobs = {}
): Promise<ConversationResult> {
  // Removed initial hammer log
  const appliedKnobs: Required<ConversationKnobs> = {
    maxPairs: knobs.maxPairs ?? 5,
    historyTokenLimit: knobs.historyTokenLimit ?? 8000,
    safetyMarginTokens: knobs.safetyMarginTokens ?? 0,
    greedyBaseline: {
      maxPairs: knobs.greedyBaseline?.maxPairs ?? 10,
      historyTokenLimit: knobs.greedyBaseline?.historyTokenLimit ?? 12000
    }
  } as any;
  const summaryInfo = await checkSummaryTrigger(chatId, messageHistory, supabase);
  const recentMessages = getRecentMessagePairs(messageHistory, appliedKnobs.historyTokenLimit, appliedKnobs.maxPairs);
  
  // Build conversation messages
  const conversationHistory = recentMessages.map(msg => ({
    role: msg.is_ai_message ? 'assistant' : 'user',
    content: msg.content
  })) as ConversationMessage[];
  
  const systemPromptTokens = estimateTokens(systemPrompt);
  const userMessageTokens = estimateTokens(userMessage);
  let historyTokens = conversationHistory.reduce((total, msg) => total + estimateTokens(msg.content), 0);
  
  const finalMessages: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];
  
  let totalTokens = systemPromptTokens + historyTokens + userMessageTokens;
  let truncated = recentMessages.length < messageHistory.length;
  const droppedMessages = messageHistory.length - recentMessages.length;
  
  // Safety check: if total exceeds max context, truncate further
  if (totalTokens > maxContextTokens || (appliedKnobs.safetyMarginTokens > 0 && (maxContextTokens - totalTokens) < appliedKnobs.safetyMarginTokens)) {
    console.log(`⚠️ Context exceeds limit or safety margin (${totalTokens}/${maxContextTokens}), truncating further...`);
    
    // Remove oldest history messages until we fit
    while (finalMessages.length > 2 && (totalTokens > maxContextTokens || (maxContextTokens - totalTokens) < appliedKnobs.safetyMarginTokens)) {
      if (finalMessages[1] && finalMessages[1].role !== 'system') {
        const removed = finalMessages.splice(1, 1)[0];
        const removedTokens = estimateTokens(removed.content);
        if (removed.role !== 'user' && removed.role !== 'assistant') continue;
        historyTokens = Math.max(0, historyTokens - removedTokens);
        totalTokens = systemPromptTokens + historyTokens + userMessageTokens;
        truncated = true;
      } else {
        break;
      }
    }
  }
  
  // Greedy baseline: what if we allowed more history tokens and more pairs
  const baselinePairs = getRecentMessagePairs(
    messageHistory,
    appliedKnobs.greedyBaseline.historyTokenLimit,
    appliedKnobs.greedyBaseline.maxPairs
  );
  const baselineHistoryTokens = baselinePairs.reduce((total, m) => total + estimateTokens(m.content), 0);
  const baselineTotal = systemPromptTokens + baselineHistoryTokens + userMessageTokens;
  const tokenSavingsAgainstGreedyHistory = Math.max(0, baselineTotal - totalTokens);
  
  // Replace final verbose log with a single debug-level aggregate if logger available
  try {
    const lg = (globalThis as any).logger;
    if (lg?.debug) {
      lg.debug('conversation.context', {
        totalMessages: messageHistory.length,
        usedMessages: recentMessages.length,
        truncated: recentMessages.length < messageHistory.length,
        summaryTrigger: summaryInfo.shouldTriggerSummary,
        currentAiCount: summaryInfo.currentAiCount,
        nextSummaryAt: summaryInfo.nextSummaryAt
      });
    }
  } catch {}
  
  return {
    messages: finalMessages,
    truncated,
    totalTokens,
    droppedMessages,
    needsSummarization: summaryInfo.shouldTriggerSummary,
    currentAiMessageCount: summaryInfo.currentAiCount,
    nextSummaryAt: summaryInfo.nextSummaryAt,
    messagesToSummarize: summaryInfo.messagesToSummarize,
    tokenBreakdown: {
      system: systemPromptTokens,
      history: historyTokens,
      currentMessage: userMessageTokens,
      remaining: maxContextTokens - totalTokens
    },
    diagnostics: {
      tokenSavingsAgainstGreedyHistory,
      baseline: {
        historyTokens: baselineHistoryTokens,
        totalTokens: baselineTotal
      }
    }
  };
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
