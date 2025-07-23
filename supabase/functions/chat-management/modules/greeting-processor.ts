/**
 * Greeting Processor Module
 * 
 * Handles greeting generation, template replacement, context integration,
 * and complete chat creation with greeting functionality.
 */

import { extractInitialContext, saveContextUpdates } from './context-extractor.ts';
import { fetchCharacterData } from './character-fetcher.ts';
import type { AddonSettings } from '../types/streaming-interfaces.ts';
import type { CreateWithGreetingRequest, ChatResponse } from '../types/index.ts';

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
  const userName = userPersona?.name || userProfile?.username || 'User';
  const charName = characterName || 'Character';
  
  console.log('🔧 Template replacement setup - userName:', userName, 'charName:', charName);
  
  return (content: string): string => {
    if (!content) return content;
    
    const replaced = content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
    
    if (content !== replaced) {
      console.log('🔄 Template replaced:', content, '->', replaced);
    }
    
    return replaced;
  };
}

/**
 * Generate processed greeting from character definitions
 */
export function generateGreeting(
  character: any,
  characterName: string,
  templateReplacer: TemplateReplacer
): string {
  console.log('🎭 Generating greeting...');
  
  const rawGreeting = character.character_definitions?.greeting || 
    `Hello! I'm ${characterName}. It's great to meet you. What would you like to talk about?`;
  
  const processedGreeting = templateReplacer(rawGreeting);
  
  console.log('✅ Processed greeting:', processedGreeting);
  return processedGreeting;
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
        
        if (contextKey && addonSettings[contextKey]) {
          messageContext[contextKey] = value;
        }
      }
    });
  }
  
  console.log('🗃️ Built message context:', messageContext);
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
  console.log('🎭 Processing greeting with context integration...');
  
  // Create template replacement function
  const templateReplacer = createTemplateReplacer(userPersona, userProfile, characterName);
  
  // Generate processed greeting
  const processedGreeting = generateGreeting(character, characterName, templateReplacer);
  
  // Build message context
  const messageContext = buildMessageContext(initialContext, addonSettings);
  
  console.log('✅ Greeting processing complete');
  
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
  const userName = userPersona?.name || userProfile?.username || 'User';
  const charName = characterName || 'Character';
  
  return (content: string): string => {
    if (!content) return content;
    
    return content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
  };
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
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('name')
      .eq('id', selectedPersonaId)
      .eq('user_id', userId)
      .single();

    if (!personaError && persona) {
      userPersona = persona;
      console.log('🎭 Using selected persona for greeting:', persona.name);
      return userPersona;
    }
  }

  // If no selected persona, get user's default persona from profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_persona_id')
    .eq('id', userId)
    .single();

  if (!profileError && profile?.default_persona_id) {
    // Get the default persona details
    const { data: defaultPersona, error: defaultPersonaError } = await supabase
      .from('personas')
      .select('name')
      .eq('id', profile.default_persona_id)
      .eq('user_id', userId)
      .single();

    if (!defaultPersonaError && defaultPersona) {
      userPersona = defaultPersona;
      console.log('🎭 Using user default persona for greeting:', defaultPersona.name);
      return userPersona;
    }
  }

  // If still no persona, try to get user's first created persona as fallback
  const { data: firstPersona, error: firstPersonaError } = await supabase
    .from('personas')
    .select('name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstPersonaError && firstPersona) {
    userPersona = firstPersona;
    console.log('🎭 Using first created persona for greeting:', firstPersona.name);
    return userPersona;
  }

  console.log('🎭 No persona found, using username for greeting');
  return null;
}

/**
 * MAIN FUNCTION: Handle complete chat creation with greeting
 */
export async function handleCreateWithGreeting(
  request: CreateWithGreetingRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<ChatResponse> {
  try {
    const { charactersData, worldInfos, greeting, selectedPersonaId, chatMode } = request;
    
    if (!charactersData || charactersData.length === 0) {
      throw new Error('No character data provided');
    }

    const character = charactersData[0];
    const character_id = character.id;
    const character_name = character.name;

    console.log('Creating chat with greeting for user:', user.id, 'character:', character_id);

    // Fetch user data
    const [userProfileResult] = await Promise.allSettled([
      supabase.from('profiles').select('username').eq('id', user.id).single()
    ]);

    const userProfile = userProfileResult.status === 'fulfilled' ? userProfileResult.value.data : null;
    
    // Get user persona for greeting template replacement
    const userPersona = await fetchUserPersona(selectedPersonaId || null, user.id, supabase);

    // Fetch character data
    const characterData = await fetchCharacterData(character_id, supabase);
    
    if (!characterData) {
      throw new Error('Character not found or access denied');
    }

  // Determine chat mode - ALWAYS fetch from user settings first
  const { data: userCharSettings } = await supabaseAdmin
    .from('user_character_settings')
    .select('chat_mode')
    .eq('user_id', user.id)
    .eq('character_id', character_id)
    .single();

  let effectiveChatMode: 'storytelling' | 'companion' = userCharSettings?.chat_mode || chatMode || 'storytelling';

  console.log('🎭 Chat mode determination:', {
    userSettingsChatMode: userCharSettings?.chat_mode,
    providedChatMode: chatMode,
    effectiveChatMode,
    userId: user.id,
    characterId: character_id
  });    // Create the chat record
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        character_id: character_id,
        title: `Chat with ${character_name}`,
        selected_persona_id: selectedPersonaId,
        chat_mode: effectiveChatMode, // Add chat_mode to the insert
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (chatError) {
      console.error('Error creating chat:', chatError);
      throw new Error('Failed to create chat');
    }

    console.log('Chat created:', chat.id);

    // Create template replacer
    const templateReplacer = createTemplateReplacer(userPersona, userProfile, character_name);

    // Generate greeting
    const greetingText = greeting || generateGreeting(characterData, character_name, templateReplacer);
    
    // Process the greeting
    const processedGreeting = greetingText;

    // Save the greeting message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,  // AI messages should have NULL author_id
        content: processedGreeting,
        is_ai_message: true,
        current_context: null,
        message_order: 1,
        created_at: new Date().toISOString()
      });

    if (messageError) {
      console.error('Error creating greeting message:', messageError);
      throw new Error('Failed to create greeting message');
    }

    console.log('✅ Chat with greeting created successfully:', chat.id);

    return {
      success: true,
      chat_id: chat.id,
      greeting: processedGreeting,
      data: {
        message: 'Chat with greeting created successfully',
        contextInfo: null
      }
    };

  } catch (error) {
    console.error('Error in handleCreateWithGreeting:', error);
    return {
      success: false,
      error: error.message
    };
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
