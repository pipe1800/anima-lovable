/**
 * Type definitions for extract-chat-context function
 */

export interface ExtractContextRequest {
  chat_id: string;
  character_id: string;
  addon_settings: AddonSettings;
}

export interface AddonSettings {
  moodTracking?: boolean;
  clothingInventory?: boolean;
  locationTracking?: boolean;
  timeAndWeather?: boolean;
  relationshipStatus?: boolean;
  characterPosition?: boolean;
  enhancedMemory?: boolean;
  dynamicWorldInfo?: boolean;
  chainOfThought?: boolean;
  fewShotExamples?: boolean;
}

export interface CharacterData {
  id: string;
  name: string;
  personality?: string;
  description?: string;
  instructions?: string;
  scenario?: string;
  example_conversations?: string;
  greeting?: string;
  personality_summary?: string;
  context_settings?: any;
  character_definitions?: CharacterDefinition;
  world_info?: WorldInfo[];
}

export interface CharacterDefinition {
  character_id: string;
  name?: string;
  personality_summary?: string;
  description?: string;
  scenario?: string;
  greeting?: string;
  [key: string]: any;
}

export interface WorldInfo {
  id: string;
  name: string;
  description: string;
  world_id: string;
  worlds?: {
    id: string;
    name: string;
    description: string;
  };
}

export interface UserPersona {
  id: string;
  user_id: string;
  name: string;
  bio?: string;
  [key: string]: any;
}

export interface UserProfile {
  id: string;
  username?: string;
  [key: string]: any;
}

export interface ExtractedContext {
  mood?: string;
  clothing?: string;
  location?: string;
  time_weather?: string;
  relationship?: string;
  character_position?: string;
  [key: string]: any;
}

export interface MessageContext {
  moodTracking?: string;
  clothingInventory?: string;
  locationTracking?: string;
  timeAndWeather?: string;
  relationshipStatus?: string;
  characterPosition?: string;
  [key: string]: any;
}

export interface ExtractContextResponse {
  success: boolean;
  chat_id: string;
  message: string;
  context_summary?: ExtractedContext | null;
  error?: string;
}

export interface RequestContext {
  requestId: string;
  userId: string;
  chatId: string;
  characterId: string;
  startTime: number;
}

export interface TemplateContext {
  userName: string;
  charName: string;
}
