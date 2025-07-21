/**
 * Calculate memory creation credit cost
 * Formula: 5 credits per 300 tokens, minimum 5 credits
 */
export function calculateMemoryCreditCost(messageCount: number): number {
  // Rough estimate: 1 token = ~4 characters, average message ~100 characters
  const estimatedTokens = messageCount * 25; // Conservative estimate
  
  // 5 credits per 300 tokens, minimum 5 credits
  const creditCost = Math.max(5, Math.ceil(estimatedTokens / 300) * 5);
  
  return creditCost;
}

/**
 * Get a user-friendly explanation of memory cost calculation
 */
export function getMemoryCostExplanation(messageCount: number): string {
  const creditCost = calculateMemoryCreditCost(messageCount);
  const estimatedTokens = messageCount * 25;
  
  if (creditCost === 5) {
    return `${creditCost} credits (minimum charge for conversations under 300 tokens)`;
  }
  
  const tokenBuckets = Math.ceil(estimatedTokens / 300);
  return `${creditCost} credits (${tokenBuckets} × 300-token bucket${tokenBuckets > 1 ? 's' : ''})`;
}
