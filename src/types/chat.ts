// Unified chat types to eliminate duplication across hooks and components

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'failed' | 'removed';
  message_order?: number; // Add message_order for proper sorting
  contextUpdates?: {
    [key: string]: {
      previous: string;
      current: string;
    };
  };
  current_context?: TrackedContext;
}

export interface TrackedContext {
  moodTracking: string;
  clothingInventory: string;
  locationTracking: string;
  timeAndWeather: string;
  relationshipStatus: string;
  characterPosition: string;
}

export interface Character {
  id: string;
  name: string;
  // UI-specific fields (for components that need display info)
  tagline?: string;
  avatar?: string;
  fallback?: string;
  // Database fields (from the actual database schema)
  creator_id?: string;
  short_description?: string | null;
  avatar_url?: string | null;
  visibility?: 'public' | 'unlisted' | 'private';
  interaction_count?: number;
  created_at?: string;
  updated_at?: string;
  default_persona_id?: string | null;
}

export interface ChatPage {
  messages: Message[];
  hasMore: boolean;
  oldestTimestamp: string | null;
}

export interface ChatMetrics {
  averageResponseTime: number;
  successRate: number;
  totalMessages: number;
  errors: number;
  lastResponseTime: number;
}

// Chat state for optimized hook
export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  trackedContext: TrackedContext;
  pendingMessages: Map<string, Message>;
  lastActivity: number;
  // Real-time connection state
  isRealtimeConnected: boolean;
  debugInfo: string[];
  // Streaming state
  isStreaming: boolean;
  streamingMessage: string;
  hasGreeting: boolean; // Add this property
}

export type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<Message> } }
  | { type: 'SET_TYPING'; payload: boolean }
  | { type: 'UPDATE_CONTEXT'; payload: TrackedContext }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'REMOVE_PENDING'; payload: string }
  | { type: 'SET_REALTIME_STATUS'; payload: boolean }
  | { type: 'ADD_DEBUG_INFO'; payload: string }
  | { type: 'SET_STREAMING'; payload: { isStreaming: boolean; message?: string } }
  | { type: 'SET_HAS_GREETING'; payload: boolean } // Add this action type
  | { type: 'CLEAR_STATE' };
