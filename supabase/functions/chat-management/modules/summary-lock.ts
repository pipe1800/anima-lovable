/**
 * Summary Lock Module
 * Prevents race conditions in auto-summary triggering
 */

// Global map to track ongoing summary operations
const summaryOperations = new Map<string, {
  promise: Promise<any>,
  timestamp: number,
  requestId: string
}>();

/**
 * Generate a unique lock key for a chat+character combination
 */
function getLockKey(chatId: string, characterId: string): string {
  return `summary-${chatId}-${characterId}`;
}

/**
 * Check if a summary is currently being processed for this chat
 */
export function isSummaryInProgress(chatId: string, characterId: string): boolean {
  const lockKey = getLockKey(chatId, characterId);
  const operation = summaryOperations.get(lockKey);
  
  if (!operation) return false;
  
  // Remove stale locks (older than 5 minutes)
  const STALE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  if (Date.now() - operation.timestamp > STALE_TIMEOUT) {
    summaryOperations.delete(lockKey);
    console.log(`🧹 Cleaned up stale summary lock for ${lockKey}`);
    return false;
  }
  
  return true;
}

/**
 * Acquire a summary lock to prevent concurrent operations
 */
export function acquireSummaryLock<T>(
  chatId: string, 
  characterId: string, 
  summaryPromise: Promise<T>,
  requestId: string
): Promise<T> {
  const lockKey = getLockKey(chatId, characterId);
  
  // If already exists, return the existing promise
  if (summaryOperations.has(lockKey)) {
    const existing = summaryOperations.get(lockKey)!;
    console.log(`🔒 Summary lock exists for ${lockKey}, waiting for completion...`, {
      existingRequestId: existing.requestId,
      newRequestId: requestId,
      waitTime: Date.now() - existing.timestamp
    });
    return existing.promise as Promise<T>;
  }
  
  // Store the new operation
  summaryOperations.set(lockKey, {
    promise: summaryPromise,
    timestamp: Date.now(),
    requestId
  });
  
  console.log(`🔐 Acquired summary lock for ${lockKey}`, { requestId });
  
  // Auto-cleanup when promise completes
  summaryPromise.finally(() => {
    summaryOperations.delete(lockKey);
    console.log(`🔓 Released summary lock for ${lockKey}`, { requestId });
  });
  
  return summaryPromise;
}

/**
 * Force release a summary lock (for cleanup/debugging)
 */
export function releaseSummaryLock(chatId: string, characterId: string): boolean {
  const lockKey = getLockKey(chatId, characterId);
  const existed = summaryOperations.has(lockKey);
  summaryOperations.delete(lockKey);
  
  if (existed) {
    console.log(`🧹 Force released summary lock for ${lockKey}`);
  }
  
  return existed;
}

/**
 * Get current summary operations (for debugging)
 */
export function getSummaryOperations(): Array<{lockKey: string, requestId: string, age: number}> {
  return Array.from(summaryOperations.entries()).map(([lockKey, operation]) => ({
    lockKey,
    requestId: operation.requestId,
    age: Date.now() - operation.timestamp
  }));
}
