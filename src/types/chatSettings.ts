import { Message, TrackedContext } from './chat';

// GLOBAL chat settings that apply to ALL chats and characters for a user
// This includes ALL chat-related settings: addons, streaming, UI, accessibility
export interface UserGlobalChatSettings {
  id: string;
  user_id: string;
  
  // ADDON SETTINGS (global - apply to all chats and characters)
  dynamic_world_info: boolean;
  enhanced_memory: boolean;
  mood_tracking: boolean;
  clothing_inventory: boolean;
  location_tracking: boolean;
  time_and_weather: boolean;
  relationship_status: boolean;
  character_position: boolean;
  chain_of_thought: boolean;
  few_shot_examples: boolean;
  
  // STREAMING SETTINGS (global)
  streaming_mode: 'instant' | 'smooth' | 'adaptive';
  
  // ACCESSIBILITY SETTINGS (global)
  font_size: 'small' | 'normal' | 'large';
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// Legacy interfaces for compatibility (DEPRECATED - everything is now global)
export interface CharacterAddonSettings {
  dynamicWorldInfo: boolean;
  enhancedMemory: boolean;
  moodTracking: boolean;
  clothingInventory: boolean;
  locationTracking: boolean;
  timeAndWeather: boolean;
  relationshipStatus: boolean;
  characterPosition: boolean;
  chainOfThought: boolean;
  fewShotExamples: boolean;
}

export interface StreamingState {
  phase: 'idle' | 'user_sent' | 'ai_streaming' | 'ai_finalizing' | 'completed';
  tempMessage: string;
  messageId: string | null;
  startTime: number;
  chunks: string[];
  lastChunkTime: number;
}

export interface StreamingConfig {
  mode: 'instant' | 'smooth' | 'adaptive';
  enabled: boolean;
}

// Update existing ChatState to include streaming config
export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  trackedContext: TrackedContext;
  pendingMessages: Map<string, Message>;
  lastActivity: number;
  isRealtimeConnected: boolean;
  debugInfo: string[];
  isStreaming: boolean;
  streamingMessage: string;
  hasGreeting: boolean;
  
  // New streaming state
  streamingState: StreamingState;
  streamingConfig: StreamingConfig;
}

// Update ChatAction to include streaming actions
export type ChatAction = 
  | { type: 'SET_STREAMING'; payload: { isStreaming: boolean; message: string } }
  | { type: 'SET_TYPING'; payload: boolean }
  | { type: 'SET_REALTIME_STATUS'; payload: boolean }
  | { type: 'ADD_DEBUG_INFO'; payload: string }
  | { type: 'UPDATE_CONTEXT'; payload: TrackedContext }
  | { type: 'CLEAR_STATE' }
  | { type: 'UPDATE_STREAMING_STATE'; payload: Partial<StreamingState> }
  | { type: 'UPDATE_STREAMING_CONFIG'; payload: Partial<StreamingConfig> }
  | { type: 'ADD_STREAMING_CHUNK'; payload: { chunk: string; timestamp: number } };
