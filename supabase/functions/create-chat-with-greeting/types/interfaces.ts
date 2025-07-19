/**
 * TypeScript Interfaces for Create Chat with Greeting Function
 * 
 * Defines the request/response structure and internal types
 * for the create-chat-with-greeting Edge Function.
 */

// ============================================================================
// REQUEST/RESPONSE INTERFACES
// ============================================================================

export interface CreateChatRequest {
  character_id: string;
  character_name: string;
  addonSettings?: AddonSettings;
}

export interface CreateChatResponse {
  success: boolean;
  chat_id?: string;
  message: string;
  error?: string;
}

export interface AddonSettings {
  moodTracking?: boolean;
  clothingInventory?: boolean;
  locationTracking?: boolean;
  timeAndWeather?: boolean;
  relationshipStatus?: boolean;
  characterPosition?: boolean;
  [key: string]: boolean | undefined;
}

// ============================================================================
// INTERNAL PROCESSING INTERFACES
// ============================================================================

export interface RequestContext {
  requestId: string;
  userId: string;
  characterId: string;
  characterName: string;
  startTime: number;
}

export interface ChatCreationData {
  chat: DatabaseChat;
  character: DatabaseCharacter;
  userData: UserData;
}

export interface GreetingData {
  processedGreeting: string;
  messageContext: Record<string, any>;
  initialContext: Record<string, any> | null;
}

// ============================================================================
// DATABASE ENTITY INTERFACES
// ============================================================================

export interface DatabaseChat {
  id: string;
  user_id: string;
  character_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
}

export interface DatabaseCharacter {
  id: string;
  name: string;
  character_definitions?: CharacterDefinitions;
}

export interface CharacterDefinitions {
  personality_summary?: string;
  description?: string;
  scenario?: string | object;
  greeting?: string;
  [key: string]: any;
}

export interface UserData {
  profile: UserProfile | null;
  persona: UserPersona | null;
}

export interface UserProfile {
  id: string;
  username?: string;
  [key: string]: any;
}

export interface UserPersona {
  id: string;
  name: string;
  user_id: string;
  [key: string]: any;
}

// ============================================================================
// UTILITY TYPE DEFINITIONS
// ============================================================================

export type TemplateReplacer = (content: string) => string;

export interface ProcessingMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  requestId: string;
}
