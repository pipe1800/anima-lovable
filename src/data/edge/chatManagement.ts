import { callEdgeFunction } from './core/client';
import { callStreamingEdgeFunction } from './core/streaming';
import type { TrackedContext } from '@/types/chat';

// Payload types
export interface SendMessagePayload {
  chatId: string;
  message: string;
  characterId: string;
  addonSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  selectedPersonaId?: string | null;
  selectedWorldInfoId?: string | null;
}

export interface RegenerateMessagePayload {
  chatId: string;
  characterId: string;
  aiMessageId: string;
  addonSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  selectedPersonaId?: string | null;
  selectedWorldInfoId?: string | null;
}

export interface DeleteMessagePayload {
  chatId: string;
  characterId: string;
  messageId: string;
}

export interface ChatManagementStreamingResult {
  content: string;
}

const FN_NAME = 'chat-management';

export const ChatManagement = {
  sendMessageStreaming: async (
    payload: SendMessagePayload,
    opts: { streamingMode?: 'smooth' | 'instant'; onToken?: (t: string, agg: string) => void; onDone?: (final: string) => void; } = {}
  ) => {
    const { done } = await callStreamingEdgeFunction(FN_NAME, { operation: 'send-message', ...payload }, {
      mode: opts.streamingMode,
      onToken: opts.onToken,
      onDone: opts.onDone
    });
    const content = await done;
    return { content } as ChatManagementStreamingResult;
  },
  regenerateMessageStreaming: async (
    payload: RegenerateMessagePayload,
    opts: { streamingMode?: 'smooth' | 'instant'; onToken?: (t: string, agg: string) => void; onDone?: (final: string) => void; } = {}
  ) => {
    const { done } = await callStreamingEdgeFunction(FN_NAME, { operation: 'regenerate-message', ...payload }, {
      mode: opts.streamingMode,
      onToken: opts.onToken,
      onDone: opts.onDone
    });
    const content = await done;
    return { content } as ChatManagementStreamingResult;
  },
  deleteMessage: (payload: DeleteMessagePayload) => callEdgeFunction(FN_NAME, { operation: 'delete-message', ...payload }),
};

export default ChatManagement;
