import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

export type SupabaseClient = ReturnType<typeof createClient>;

export interface User {
  id: string;
  email?: string;
}

export interface AuthResult {
  user: User;
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
}

export interface Character {
  id: string;
  name?: string;
  personality_summary?: string;
  description?: string;
  scenario?: string;
  greeting?: string;
  character_definitions?: CharacterDefinition;
}

export interface CharacterDefinition {
  character_id: string;
  name?: string;
  personality_summary?: string;
  description?: string;
  scenario?: string;
  greeting?: string;
}

export interface AddonSettings {
  dynamicWorldInfo?: boolean;
  moodTracking?: boolean;
  clothingInventory?: boolean;
  locationTracking?: boolean;
  timeAndWeather?: boolean;
  relationshipStatus?: boolean;
  characterPosition?: boolean;
  chainOfThought?: boolean;
  fewShotExamples?: boolean;
  enhancedMemory?: boolean;
}

export interface TemplateContext {
  userName: string;
  charName: string;
}

export interface CurrentContext {
  moodTracking?: string;
  clothingInventory?: string;
  locationTracking?: string;
  timeAndWeather?: string;
  relationshipStatus?: string;
  characterPosition?: string;
}

export interface ContextData {
  mood?: string;
  clothing?: string;
  location?: string;
  time_weather?: string;
  relationship?: string;
  character_position?: string;
}

export interface RequestContext {
  requestId: string;
  userId: string;
  chatId: string;
  characterId: string;
  startTime: number;
}

export interface Message {
  id?: string;
  chat_id: string;
  author_id: string | null;
  content: string;
  is_ai_message: boolean;
  is_placeholder?: boolean;
  current_context?: CurrentContext | null;
  message_order: number;
  created_at: string;
  updated_at?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamingUpdate {
  content: string;
  shouldUpdateDatabase: boolean;
  isComplete: boolean;
}

export interface CreditInfo {
  baseCost: number;
  addonPercentage: number;
  totalCost: number;
}

export interface PlanInfo {
  name: string;
  model: string;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
} as const;
