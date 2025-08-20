/**
 * Greeting Processor Module
 * 
 * Handles greeting generation, template replacement, context integration,
 * and complete chat creation with greeting functionality.
 */

import { fetchCharacterData } from './character-fetcher.ts';
import { mapGlobalSettingsToAddonSettings, sanitizeAddonSettings, anyAddonEnabled } from '../../_shared/settings-mapper.ts';
import type { AddonSettings } from '../types/streaming-interfaces.ts';
import type { CreateWithGreetingRequest, ChatResponse } from '../types/index.ts';
import type { TemplateContext } from '../types/streaming-interfaces.ts';
import { buildTemplateReplacer } from './database.ts';

export interface TemplateReplacer {
  (content: string): string;
}

export interface GreetingProcessingResult {
  processedGreeting: string;
  messageContext: Record<string, any>;
}

/**
 * Create template replacement function
 */
export function createTemplateReplacer(
  userPersona: any,
  userProfile: any,
  characterName: string
): TemplateReplacer {
  const context: TemplateContext = {
    userName: userPersona?.name || userProfile?.username || 'User',
    charName: characterName || 'Character'
  };
  return buildTemplateReplacer(context);
}

/**
 * Safely parse personality_summary JSON and return alternate greetings, if any
 */
function getAlternateGreetingsFromDefinition(character: any): string[] {
  try {
    const raw = character?.character_definitions?.personality_summary;
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const alts: unknown = parsed?.dialogue?.alternate_greetings;
    if (Array.isArray(alts)) {
      return alts
        .map((g) => (typeof g === 'string' ? g.trim() : ''))
        .filter((g) => !!g);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Generate processed greeting from character definitions
 */
export function generateGreeting(
  character: any,
  characterName: string,
  templateReplacer: TemplateReplacer
): string {
  const baseGreeting =
    character.character_definitions?.greeting ||
    `Hello! I'm ${characterName}. It's great to meet you. What would you like to talk about?`;

  // Include alternates if present in personality_summary JSON
  const alternates = getAlternateGreetingsFromDefinition(character);
  const candidates = [baseGreeting, ...alternates]
    .map((g) => (typeof g === 'string' ? g.trim() : ''))
    .filter((g) => !!g);

  // Pick random greeting from candidates
  const chosen = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : baseGreeting;
  
  return templateReplacer(chosen);
}

/**
 * Build message context from initial context and addon settings
 */
export function buildMessageContext(
  initialContext: Record<string, any> | null,
  addonSettings: AddonSettings | undefined
): Record<string, any> {
  const messageContext: Record<string, any> = {};
  if (initialContext && addonSettings) {
    Object.entries(initialContext).forEach(([field, value]) => {
      if (value && value !== 'No context') {
        // Map context fields to addon setting keys
        const contextKey = mapContextFieldToAddonKey(field);
        if (contextKey && (addonSettings as any)[contextKey]) {
          messageContext[contextKey] = value;
        }
      }
    });
  }
  return messageContext;
}

/**
 * Map context field names to addon setting keys
 */
function mapContextFieldToAddonKey(field: string): string | null {
  const fieldMapping: Record<string, string> = {
    'mood': 'moodTracking',
    'clothing': 'clothingInventory',
    'location': 'locationTracking',
    'time_weather': 'timeAndWeather',
    'relationship': 'relationshipStatus',
    'character_position': 'characterPosition'
  };
  
  return fieldMapping[field] || null;
}

/**
 * Process greeting with context integration
 */
export function processGreetingWithContext(
  character: any,
  characterName: string,
  userPersona: any,
  userProfile: any,
  initialContext: Record<string, any> | null,
  addonSettings: AddonSettings | undefined
): GreetingProcessingResult {
  const templateReplacer = createTemplateReplacer(userPersona, userProfile, characterName);
  const processedGreeting = generateGreeting(character, characterName, templateReplacer);
  const messageContext = buildMessageContext(initialContext, addonSettings);
  return {
    processedGreeting,
    messageContext
  };
}

/**
 * Enhanced greeting processing with context extraction support
 */
export function createContextTemplateReplacer(
  userPersona: any,
  userProfile: any,
  characterName: string
): TemplateReplacer {
  return createTemplateReplacer(userPersona, userProfile, characterName);
}

/**
 * Fetch user persona for greeting template replacement
 */
export async function fetchUserPersona(
  selectedPersonaId: string | null,
  userId: string,
  supabase: any
): Promise<{ name: string } | null> {
  let userPersona: { name: string } | null = null;
  if (selectedPersonaId) {
    // Get the selected persona details
    const { data: persona } = await supabase
      .from('personas')
      .select('name')
      .eq('id', selectedPersonaId)
      .eq('user_id', userId)
      .single();
    if (persona) return persona;
  }
  // If no selected persona, get user's default persona from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_persona_id')
    .eq('id', userId)
    .single();
  if (profile?.default_persona_id) {
    // Get the default persona details
    const { data: defaultPersona } = await supabase
      .from('personas')
      .select('name')
      .eq('id', profile.default_persona_id)
      .eq('user_id', userId)
      .single();
    if (defaultPersona) return defaultPersona;
  }
  // If still no persona, try to get user's first created persona as fallback
  const { data: firstPersona } = await supabase
    .from('personas')
    .select('name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstPersona) return firstPersona;
  return null;
}

/**
 * MAIN FUNCTION: Handle complete chat creation with greeting
 */
export async function handleCreateWithGreeting(
  request: CreateWithGreetingRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any,
  req?: Request
): Promise<ChatResponse> {
  try {
    const { charactersData, worldInfos, greeting, selectedPersonaId, chatMode } = request;
    if (!charactersData || charactersData.length === 0) {
      throw new Error('No character data provided');
    }
    const character = charactersData[0];
    const character_id = character.id;
    const character_name = character.name;
    const [userProfileResult] = await Promise.allSettled([
      supabase.from('profiles').select('username').eq('id', user.id).single()
    ]);
    const userProfile = userProfileResult.status === 'fulfilled' ? userProfileResult.value.data : null;
    const userPersona = await fetchUserPersona(selectedPersonaId || null, user.id, supabase);
    const characterData = await fetchCharacterData(character_id, supabase);
    if (!characterData) {
      throw new Error('Character not found or access denied');
    }
    const { data: userCharSettings } = await supabaseAdmin
      .from('user_character_settings')
      .select('chat_mode')
      .eq('user_id', user.id)
      .eq('character_id', character_id)
      .single();
    let effectiveChatMode: 'storytelling' | 'companion' = userCharSettings?.chat_mode || chatMode || 'storytelling';
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        character_id: character_id,
        title: `Chat with ${character_name}`,
        selected_persona_id: selectedPersonaId,
        chat_mode: effectiveChatMode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();
    if (chatError) {
      throw new Error('Failed to create chat');
    }
    const templateReplacer = createTemplateReplacer(userPersona, userProfile, character_name);
    const greetingText = greeting || generateGreeting(characterData, character_name, templateReplacer);
    const processedGreeting = greetingText;
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,
        content: processedGreeting,
        is_ai_message: true,
        current_context: null,
        message_order: 1,
        created_at: new Date().toISOString()
      });
    if (messageError) {
      throw new Error('Failed to create greeting message');
    }
  // Initial addon context extraction is now deferred until first user → AI exchange; removed fire-and-forget call.

    return {
      success: true,
      chat_id: chat.id,
      greeting: processedGreeting,
      data: { message: 'Chat with greeting created successfully', contextInfo: null }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Prepare character data for context extraction
 */
export function prepareCharacterForContext(character: any): any {
  return {
    personality_summary: character.character_definitions?.personality_summary || '',
    description: character.character_definitions?.description || '',
    scenario: character.character_definitions?.scenario || '',
    greeting: character.character_definitions?.greeting || ''
  };
}
