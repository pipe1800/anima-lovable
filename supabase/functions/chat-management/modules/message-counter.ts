import { listSummaryMessageCounts } from './knowledge.ts';
/**
 * Message-based auto-summarization and token management
 * New system: Auto-summary every 5 AI responses (changed for testing), context preserved with recent messages
 */ /**
 * Estimate token count for text using cl100k_base approximation
 */ export function estimateTokens(text) {
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
 */ export function countAiMessages(messageHistory) {
  return messageHistory.filter((msg)=>msg.is_ai_message && !msg.content.includes('[PLACEHOLDER]')).length;
}
/**
 * Get the latest summary information for a chat
export async function getLatestSummaryInfo(chatId, supabase) {
  try {
    const counts = await listSummaryMessageCounts(supabase, { chatId });
    if (!counts || counts.length === 0) {
      return {
        lastSummaryEndMessage: 0,
        hasSummaries: false,
        lastSummaryAt: 0
      };
    }
    return {
      lastSummaryEndMessage: counts[counts.length - 1],
      hasSummaries: true,
      lastSummaryAt: counts[counts.length - 1]
    };
  } catch (error) {
    console.error('Error fetching summary info:', error);
    return {
      lastSummaryEndMessage: 0,
      hasSummaries: false,
      lastSummaryAt: 0
    };
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
 */ export function getRecentMessagePairs(messageHistory, maxTokens = 12000, maxPairs = 5) {
  // Sort messages by order (most recent first)
  const sortedMessages = [
    ...messageHistory
  ].sort((a, b)=>b.message_order - a.message_order);
  const recentMessages = [];
  let currentTokens = 0;
  let pairCount = 0;
  const MAX_PAIRS = Math.max(1, maxPairs);
  // Collect exactly K pairs (user + AI response), not all messages
  let i = 0;
  while(i < sortedMessages.length && pairCount < MAX_PAIRS){
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
      let userMessage = null;
      for(let j = i + 1; j < sortedMessages.length; j++){
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
          if (!recentMessages.find((m)=>m.id === userMessage.id)) {
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
  recentMessages.sort((a, b)=>a.message_order - b.message_order);
  // REPLACED verbose log with trace-level concise version
  if (globalThis.logger?.isTrace?.()) {
    globalThis.logger.trace('history.recentPairs', {
      totalMessages: messageHistory.length,
      included: recentMessages.length,
      pairs: pairCount,
      tokens: currentTokens,
      maxTokens,
      maxPairs
    });
  }
  return recentMessages;
}
/**
 * Build conversation messages with new message-based system
 */ export async function buildConversationMessagesWithMessageBudget(systemPrompt, messageHistory, userMessage, maxContextTokens, chatId, supabase, knobs = {}) {
  // Removed initial hammer log
  const appliedKnobs = {
    maxPairs: knobs.maxPairs ?? 5,
    historyTokenLimit: knobs.historyTokenLimit ?? 8000,
    safetyMarginTokens: knobs.safetyMarginTokens ?? 0,
    greedyBaseline: {
      maxPairs: knobs.greedyBaseline?.maxPairs ?? 10,
      historyTokenLimit: knobs.greedyBaseline?.historyTokenLimit ?? 12000
    }
  };
  const summaryInfo = await checkSummaryTrigger(chatId, messageHistory, supabase);
  const recentMessages = getRecentMessagePairs(messageHistory, appliedKnobs.historyTokenLimit, appliedKnobs.maxPairs);
  // Build conversation messages
  const conversationHistory = recentMessages.map((msg)=>({
      role: msg.is_ai_message ? 'assistant' : 'user',
      content: msg.content
    }));
  const systemPromptTokens = estimateTokens(systemPrompt);
  const userMessageTokens = estimateTokens(userMessage);
  let historyTokens = conversationHistory.reduce((total, msg)=>total + estimateTokens(msg.content), 0);
  const finalMessages = [
    {
      role: 'system',
      content: systemPrompt
    },
    ...conversationHistory,
    {
      role: 'user',
      content: userMessage
    }
  ];
  let totalTokens = systemPromptTokens + historyTokens + userMessageTokens;
  let truncated = recentMessages.length < messageHistory.length;
  const droppedMessages = messageHistory.length - recentMessages.length;
  // Safety check: if total exceeds max context, truncate further
  if (totalTokens > maxContextTokens || appliedKnobs.safetyMarginTokens > 0 && maxContextTokens - totalTokens < appliedKnobs.safetyMarginTokens) {
    console.log(`⚠️ Context exceeds limit or safety margin (${totalTokens}/${maxContextTokens}), truncating further...`);
    // Remove oldest history messages until we fit
    while(finalMessages.length > 2 && (totalTokens > maxContextTokens || maxContextTokens - totalTokens < appliedKnobs.safetyMarginTokens)){
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
  const baselinePairs = getRecentMessagePairs(messageHistory, appliedKnobs.greedyBaseline.historyTokenLimit, appliedKnobs.greedyBaseline.maxPairs);
  const baselineHistoryTokens = baselinePairs.reduce((total, m)=>total + estimateTokens(m.content), 0);
  const baselineTotal = systemPromptTokens + baselineHistoryTokens + userMessageTokens;
  const tokenSavingsAgainstGreedyHistory = Math.max(0, baselineTotal - totalTokens);
  // Replace final verbose log with a single debug-level aggregate if logger available
  try {
    const lg = globalThis.logger;
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
  } catch (diagnosticError) {
    console.warn('Failed to emit conversation context diagnostics', diagnosticError);
  }
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
 */ export function calculateMessageTokens(messages) {
  return messages.reduce((total, msg)=>{
    // Add small overhead for role labels and formatting
    const contentTokens = estimateTokens(msg.content);
    const roleTokens = 3; // Approximate tokens for role formatting
    return total + contentTokens + roleTokens;
  }, 0);
}
