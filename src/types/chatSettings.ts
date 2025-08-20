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
  god_mode: boolean; // NEW: user assertions override context when true
  
  // STREAMING SETTINGS (global)
  streaming_mode: 'instant' | 'smooth' | 'adaptive';
  
  // ACCESSIBILITY SETTINGS (global)
  font_size: 'small' | 'normal' | 'large';

  // STYLE SETTINGS (global per user)
  ai_text_color: string; // e.g., '#E5E7EB'
  user_text_color: string; // e.g., '#FFFFFF'
  show_character_avatar: boolean;
  show_user_avatar: boolean;
  background_image_url: string | null;
  // New: Bubble colors and transparency
  ai_bubble_color: string; // hex color
  ai_bubble_opacity: number; // 0..1
  user_bubble_color: string; // hex color
  user_bubble_opacity: number; // 0..1
  // New: Semantic highlighting controls
  semantic_overrides_mode: 'default' | 'custom' | 'disabled';
  speech_color?: string | null; // for quoted text
  action_color?: string | null; // for *action*
  emphasis_color?: string | null; // for _emphasis_
  parenthetical_color?: string | null; // for (parenthetical)
  
  // New: Advanced Avatar Styles
  avatar_style: 'classic' | 'bubble-bg' | 'portrait' | 'side-banner';
  
  // Portrait style settings
  portrait_frame_style: 'clean' | 'polaroid' | 'foil'; // frame appearance
  portrait_frame_color: string; // hex color for frame
  
  // Side Banner settings
  banner_width: 'sm' | 'md' | 'lg'; // width of the banner strip
  banner_tint_from_avatar: boolean; // extract color from avatar for tint
  
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
