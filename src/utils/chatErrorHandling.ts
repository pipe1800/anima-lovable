// Standardized error handling utilities for chat components
import { toast } from 'sonner';

export interface ChatError extends Error {
  code?: string;
  context?: string;
}

/**
 * Standardized error handler for chat operations
 * @param error - The error to handle
 * @param operation - Description of the operation that failed
 * @param showToast - Whether to show a toast notification (default: true)
 */
export const handleChatError = (
  error: unknown, 
  operation: string, 
  showToast: boolean = true
): ChatError => {
  const chatError: ChatError = error instanceof Error 
    ? Object.assign(error, { context: operation })
    : new Error(`${operation}: ${String(error)}`);

  // Log for debugging
  console.error(`🚨 Chat Error [${operation}]:`, chatError);

  // Show user-friendly toast
  if (showToast) {
    const userMessage = getChatErrorMessage(chatError, operation);
    toast.error(userMessage);
  }

  return chatError;
};

/**
 * Get user-friendly error message for common chat errors
 */
const getChatErrorMessage = (error: ChatError, operation: string): string => {
  // Network/connectivity errors
  if (error.message.includes('fetch') || error.message.includes('network')) {
    return 'Connection issue. Please check your internet and try again.';
  }

  // Authentication errors
  if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
    return 'Please sign in again to continue.';
  }

  // Rate limiting
  if (error.message.includes('rate limit') || error.message.includes('too many')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Credits/billing
  if (error.message.includes('credits') || error.message.includes('insufficient')) {
    return 'Insufficient credits. Please purchase more credits to continue.';
  }

  // Streaming specific
  if (operation.includes('stream') || operation.includes('message')) {
    return 'Message failed to send. Please try again.';
  }

  // Generic fallback
  return `${operation} failed. Please try again.`;
};

/**
 * Wrapper for async operations with standardized error handling
 */
export const withChatErrorHandling = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  showToast: boolean = true
): Promise<T | null> => {
  try {
    return await operation();
  } catch (error) {
    handleChatError(error, operationName, showToast);
    return null;
  }
};

/**
 * Specific error handlers for common chat operations
 */
export const chatErrorHandlers = {
  sendMessage: (error: unknown) => handleChatError(error, 'Send message'),
  loadMessages: (error: unknown) => handleChatError(error, 'Load messages'),
  saveSettings: (error: unknown) => handleChatError(error, 'Save settings'),
  startChat: (error: unknown) => handleChatError(error, 'Start chat'),
  deleteChat: (error: unknown) => handleChatError(error, 'Delete chat'),
  loadCredits: (error: unknown) => handleChatError(error, 'Load credits'),
  streaming: (error: unknown) => handleChatError(error, 'Streaming response'),
};
