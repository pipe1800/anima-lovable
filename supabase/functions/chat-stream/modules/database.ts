import type { 
  SupabaseClient, 
  Message, 
  Character, 
  CurrentContext,
  TemplateContext 
} from '../types/interfaces.ts';
import type { GlobalChatSettings } from '../../_shared/settings-mapper.ts';

/**
 * Database operations and utilities
 * Handles message persistence, character data fetching, and chat updates
 */

export async function fetchCharacterData(
  characterId: string,
  supabaseAdmin: SupabaseClient
): Promise<Character> {
  const { data: character, error } = await supabaseAdmin
    .from('character_definitions')
    .select('personality_summary, description, scenario, greeting')
    .eq('character_id', characterId)
    .single();

  if (error) {
    console.error('Character definition error:', error);
    throw new Error('Character definition not found');
  }

  return character;
}

export async function fetchConversationHistory(
  chatId: string,
  supabase: SupabaseClient,
  limit: number = 20
): Promise<any[]> {
  const { data: messageHistory, error } = await supabase
    .from('messages')
    .select('content, is_ai_message, created_at, message_order')
    .eq('chat_id', chatId)
    .order('message_order', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch conversation history:', error);
    return [];
  }

  return messageHistory || [];
}

export async function fetchUserProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<any> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Profile error:', error);
    return null;
  }

  return profile;
}

export async function fetchUserGlobalSettings(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<GlobalChatSettings | null> {
  const { data: settings, error } = await supabaseAdmin
    .from('user_global_chat_settings')
    .select(`
      dynamic_world_info,
      enhanced_memory,
      mood_tracking,
      clothing_inventory,
      location_tracking,
      time_and_weather,
      relationship_status,
      character_position,
      chain_of_thought,
      few_shot_examples,
      streaming_mode,
      font_size
    `)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Global settings error:', error);
    return null;
  }

  return settings;
}

export async function fetchSelectedPersona(
  selectedPersonaId: string | undefined,
  userId: string,
  supabase: SupabaseClient
): Promise<{ name?: string; bio?: string } | null> {
  if (!selectedPersonaId) return null;

  const { data: persona } = await supabase
    .from('personas')
    .select('name, bio')
    .eq('id', selectedPersonaId)
    .eq('user_id', userId)
    .single();

  return persona;
}

export async function fetchCurrentContext(
  userId: string,
  chatId: string,
  characterId: string,
  supabase: SupabaseClient
): Promise<CurrentContext> {
  const { data: currentContextData } = await supabase
    .from('user_chat_context')
    .select('context_type, current_context')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .eq('character_id', characterId);

  const currentContext: CurrentContext = {};
  
  if (currentContextData) {
    currentContextData.forEach((ctx) => {
      if (ctx.current_context && ctx.current_context !== 'No context') {
        const contextKey = ctx.context_type === 'mood' ? 'moodTracking'
          : ctx.context_type === 'clothing' ? 'clothingInventory'
          : ctx.context_type === 'location' ? 'locationTracking'
          : ctx.context_type === 'time_weather' ? 'timeAndWeather'
          : ctx.context_type === 'relationship' ? 'relationshipStatus'
          : ctx.context_type === 'character_position' ? 'characterPosition'
          : null;

        if (contextKey) {
          currentContext[contextKey as keyof CurrentContext] = ctx.current_context;
        }
      }
    });
  }

  return currentContext;
}

export async function getNextMessageOrder(
  chatId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { data: lastMessage } = await supabase
    .from('messages')
    .select('message_order')
    .eq('chat_id', chatId)
    .order('message_order', { ascending: false })
    .limit(1)
    .single();

  return (lastMessage?.message_order || 0) + 1;
}

export async function saveUserMessage(
  supabase: SupabaseClient,
  chatId: string,
  userId: string,
  message: string,
  messageOrder: number
): Promise<Message> {
  const { data: userMessage, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      author_id: userId,
      content: message,
      is_ai_message: false,
      message_order: messageOrder,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to save user message:', error);
    throw new Error('Failed to save user message');
  }

  return userMessage;
}

export async function createPlaceholderMessage(
  supabase: SupabaseClient,
  chatId: string,
  messageOrder: number
): Promise<Message | null> {
  // Use crypto.randomUUID() to generate a proper UUID for the placeholder
  const placeholderId = crypto.randomUUID();
  
  const { data: placeholder, error } = await supabase
    .from('messages')
    .insert({
      id: placeholderId,
      chat_id: chatId,
      author_id: null,
      content: '',
      is_ai_message: true,
      is_placeholder: true,
      message_order: messageOrder,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating placeholder message:', error);
    return null;
  }

  return placeholder;
}

export async function updateMessageContent(
  supabaseAdmin: SupabaseClient,
  messageId: string,
  content: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({
      content: content,
      updated_at: new Date().toISOString()
    })
    .eq('id', messageId);

  if (error) {
    console.error('Error updating message content:', error);
  }
}

export async function saveCharacterMessage(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  userId: string,
  chatId: string,
  message: string,
  currentContext: CurrentContext,
  placeholderId: string,
  messageOrder: number
): Promise<Message> {
  if (placeholderId) {
    // Update existing placeholder using admin client (placeholders have author_id: null)
    const { data: messageData, error: messageError } = await supabaseAdmin
      .from('messages')
      .update({
        content: message,
        is_placeholder: false,
        current_context: currentContext,
        updated_at: new Date().toISOString()
      })
      .eq('id', placeholderId)
      .select()
      .single();

    if (messageError) {
      console.error('Error updating placeholder message:', messageError);
      throw new Error('Failed to update character message');
    }

    return messageData;
  } else {
    // Create new message (fallback)
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        author_id: null,
        content: message,
        is_ai_message: true,
        current_context: currentContext,
        message_order: messageOrder || 1,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error saving character message:', messageError);
      throw new Error('Failed to save character message');
    }

    return messageData;
  }
}

export async function updateChatLastActivity(
  supabase: SupabaseClient,
  chatId: string,
  characterId: string
): Promise<void> {
  const timestamp = new Date().toISOString();
  
  // Update chat last_message_at
  await supabase
    .from('chats')
    .update({ last_message_at: timestamp })
    .eq('id', chatId);

  // Update character last_activity
  await supabase
    .from('characters')
    .update({ last_activity: timestamp })
    .eq('id', characterId);
}

export function replaceTemplates(content: string, context: TemplateContext): string {
  if (!content || typeof content !== 'string') return content || '';
  
  const { userName = 'User', charName = 'Character' } = context;
  console.log('🔧 Template replacement - userName:', userName, 'charName:', charName);
  
  try {
    const replaced = content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
    
    if (content !== replaced) {
      console.log('🔄 Template replaced:', content.substring(0, 50) + '...', '->', replaced.substring(0, 50) + '...');
    }
    
    return replaced;
  } catch (error) {
    console.error('Template replacement error:', error);
    return content;
  }
}
