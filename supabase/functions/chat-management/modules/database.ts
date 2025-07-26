import type { 
  SupabaseClient, 
  Message, 
  Character, 
  CurrentContext,
  TemplateContext 
} from '../types/streaming-interfaces.ts';
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
    .select('character_id, personality_summary, description, scenario, greeting')
    .eq('character_id', characterId)
    .single();

  if (error) {
    console.error('Character definition error:', error);
    throw new Error('Character definition not found');
  }

  // Return character with id field mapped correctly
  return {
    id: character.character_id, // Map character_id to id
    personality_summary: character.personality_summary,
    description: character.description,
    scenario: character.scenario,
    greeting: character.greeting
  };
}

export async function fetchConversationHistory(
  chatId: string,
  supabase: SupabaseClient,
  limit: number = 100
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
    .select('username, timezone')
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

export async function fetchUserCharacterSettings(
  userId: string,
  characterId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ chat_mode: 'storytelling' | 'companion'; time_awareness_enabled: boolean } | null> {
  const { data: settings, error } = await supabaseAdmin
    .from('user_character_settings')
    .select('chat_mode, time_awareness_enabled')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .single();

  if (error && error.code !== 'PGRST116') { // Not found error
    console.error('User character settings error:', error);
    return null;
  }

  // Return default values if no settings found
  return settings || { chat_mode: 'storytelling', time_awareness_enabled: false };
}

export async function fetchUserSelectedWorldInfo(
  userId: string,
  characterId: string,
  worldInfoId: string | null,
  supabase: SupabaseClient
): Promise<Array<{ keywords: string[]; entry_text: string }> | null> {
  console.log('🌍 fetchUserSelectedWorldInfo called with:', { 
    userId, 
    characterId, 
    worldInfoId,
    worldInfoIdType: typeof worldInfoId,
    worldInfoIdNull: worldInfoId === null,
    worldInfoIdUndefined: worldInfoId === undefined,
    worldInfoIdEmpty: worldInfoId === ''
  });

  if (!worldInfoId) {
    console.log('❌ No worldInfoId provided, returning null');
    return null;
  }

  console.log('🌍 Fetching world info entries for:', worldInfoId);

  // First, verify user has access to this world info (either owns it or has it in collection)
  const { data: worldInfoAccess, error: accessError } = await supabase
    .from('world_infos')
    .select('id, creator_id, name')
    .eq('id', worldInfoId)
    .single();

  console.log('🔍 World info access check:', { 
    worldInfoAccess, 
    accessError,
    worldInfoId 
  });

  if (!worldInfoAccess) {
    console.log('❌ World info not found:', worldInfoId);
    return null;
  }

  // Check if user owns the world info or has it in their collection
  const isOwner = worldInfoAccess.creator_id === userId;
  let hasAccess = isOwner;

  console.log('👤 Ownership check:', { 
    isOwner, 
    worldInfoCreatorId: worldInfoAccess.creator_id, 
    userId 
  });

  if (!isOwner) {
    const { data: userWorldInfo, error: collectionError } = await supabase
      .from('world_info_users')
      .select('id')
      .eq('user_id', userId)
      .eq('world_info_id', worldInfoId)
      .single();

    console.log('📚 Collection access check:', { 
      userWorldInfo, 
      collectionError 
    });

    hasAccess = !!userWorldInfo;
  }

  if (!hasAccess) {
    console.log('❌ User does not have access to world info:', worldInfoId);
    return null;
  }

  console.log('✅ User has access to world info:', worldInfoId);

  // Fetch world info entries
  const { data: entries, error } = await supabase
    .from('world_info_entries')
    .select('keywords, entry_text')
    .eq('world_info_id', worldInfoId);

  console.log('📝 World info entries query result:', { 
    entries, 
    error,
    entriesCount: entries?.length || 0,
    firstEntryKeywords: entries?.[0]?.keywords,
    firstEntryText: entries?.[0]?.entry_text?.substring(0, 100) + '...'
  });

  if (error) {
    console.error('❌ Error fetching world info entries:', error);
    return null;
  }

  console.log(`✅ Fetched ${entries?.length || 0} world info entries`);
  
  // Log each entry for debugging
  entries?.forEach((entry, index) => {
    console.log(`📋 Entry ${index + 1}:`, {
      keywords: entry.keywords,
      textLength: entry.entry_text?.length || 0,
      textPreview: entry.entry_text?.substring(0, 50) + '...'
    });
  });

  return entries || [];
}

export async function fetchCharacterMemories(
  userId: string,
  characterId: string,
  supabase: SupabaseClient
): Promise<Array<{ summary_content: string; trigger_keywords: string[]; created_at: string }> | null> {
  console.log('🧠 Fetching character memories for:', { userId, characterId });

  try {
    const { data: memories, error } = await supabase
      .from('character_memories')
      .select('summary_content, trigger_keywords, created_at')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching character memories:', error);
      return null;
    }

    console.log(`✅ Fetched ${memories?.length || 0} character memories`);
    
    // Log each memory for debugging
    memories?.forEach((memory, index) => {
      console.log(`🧠 Memory ${index + 1}:`, {
        keywords: memory.trigger_keywords,
        contentLength: memory.summary_content?.length || 0,
        contentPreview: memory.summary_content?.substring(0, 100) + '...',
        createdAt: memory.created_at
      });
    });

    return memories || [];
  } catch (error) {
    console.error('❌ Unexpected error fetching character memories:', error);
    return null;
  }
}

export async function fetchSelectedPersona(
  selectedPersonaId: string | undefined,
  userId: string,
  supabase: SupabaseClient
): Promise<{ name?: string; bio?: string; lore?: string } | null> {
  if (!selectedPersonaId) return null;

  const { data: persona } = await supabase
    .from('personas')
    .select('name, bio, lore')
    .eq('id', selectedPersonaId)
    .eq('user_id', userId)
    .single();

  return persona;
}

/**
 * Get the user's last used persona ID from their most recent chat
 */
async function getUserLastUsedPersona(userId: string, supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('chats')
    .select('selected_persona_id')
    .eq('user_id', userId)
    .not('selected_persona_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.selected_persona_id;
}

/**
 * Get the user's default persona (first created persona if no recent usage)
 */
async function getUserDefaultPersona(userId: string, supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('personas')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

/**
 * Get the best persona for a new chat based on user's default persona
 */
export async function getBestPersonaForNewChat(userId: string, characterId: string, supabase: SupabaseClient): Promise<string | null> {
  // Get the user's default persona from their profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_persona_id')
    .eq('id', userId)
    .single();

  if (profileError || !profile?.default_persona_id) {
    console.log('🎭 No user default persona found, trying user\'s first persona');
    // Fallback to user's first created persona
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (personaError || !persona) {
      console.log('🎭 No user personas found');
      return null;
    }

    return persona.id;
  }

  // Verify the persona still exists and belongs to this user
  const { data: persona, error: personaError } = await supabase
    .from('personas')
    .select('id')
    .eq('id', profile.default_persona_id)
    .eq('user_id', userId)
    .single();

  if (personaError || !persona) {
    console.log('🎭 User default persona not found or doesn\'t belong to user');
    return null;
  }

  console.log('🎭 Using user default persona:', profile.default_persona_id);
  return profile.default_persona_id;
}

/**
 * Fetch the selected persona for a chat from the chat table
 */
export async function fetchChatSelectedPersona(
  chatId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{ name?: string; bio?: string; lore?: string } | null> {
  const { data: chat } = await supabase
    .from('chats')
    .select(`
      selected_persona_id,
      personas:selected_persona_id(
        name,
        bio,
        lore
      )
    `)
    .eq('id', chatId)
    .eq('user_id', userId)
    .single();

  if (!chat?.personas) return null;
  return chat.personas;
}

export async function fetchCurrentContext(
  userId: string,
  chatId: string,
  characterId: string,
  supabase: SupabaseClient
): Promise<CurrentContext> {
  // Query the correct table: chat_context
  const { data: contextData, error } = await supabase
    .from('chat_context')
    .select('current_context')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .eq('character_id', characterId)
    .single();

  if (error || !contextData?.current_context) {
    console.log('No context found in chat_context table for chat:', chatId);
    return {};
  }

  // The context is stored in database format, convert to interface format
  const dbContext = contextData.current_context;
  const currentContext: CurrentContext = {};
  
  // Convert database field names to interface field names
  if (dbContext.mood && dbContext.mood !== 'No context') {
    currentContext.moodTracking = dbContext.mood;
  }
  if (dbContext.clothing && dbContext.clothing !== 'No context') {
    currentContext.clothingInventory = dbContext.clothing;
  }
  if (dbContext.location && dbContext.location !== 'No context') {
    currentContext.locationTracking = dbContext.location;
  }
  if (dbContext.time_weather && dbContext.time_weather !== 'No context') {
    currentContext.timeAndWeather = dbContext.time_weather;
  }
  if (dbContext.relationship && dbContext.relationship !== 'No context') {
    currentContext.relationshipStatus = dbContext.relationship;
  }
  if (dbContext.character_position && dbContext.character_position !== 'No context') {
    currentContext.characterPosition = dbContext.character_position;
  }

  console.log('✅ Fetched and converted context:', { dbContext, currentContext });
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

export async function getLatestAutoSummary(
  characterId: string,
  supabase: SupabaseClient
): Promise<{ name: string; summary_content: string; created_at: string; id: string } | null> {
  console.log('🤖 Fetching latest auto-summary for character:', {
    characterId: characterId,
    characterIdType: typeof characterId,
    characterIdValue: characterId,
    isUndefined: characterId === undefined,
    isStringUndefined: characterId === 'undefined'
  });

  // Add validation to prevent UUID errors
  if (!characterId || characterId === 'undefined' || typeof characterId !== 'string') {
    console.warn('⚠️ Invalid characterId for auto-summary fetch, skipping:', characterId);
    return null;
  }

  try {
    const { data: summary, error } = await supabase
      .from('character_memories')
      .select('id, name, summary_content, created_at')
      .eq('character_id', characterId)
      .eq('is_auto_summary', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ Error fetching auto-summary:', error);
      return null;
    }

    if (summary) {
      console.log('✅ Found latest auto-summary:', {
        id: summary.id,
        name: summary.name,
        createdAt: summary.created_at,
      });
    } else {
      console.log('🤷 No auto-summary found for character:', characterId);
    }

    return summary;
  } catch (error) {
    console.error('❌ Unexpected error fetching auto-summary:', error);
    return null;
  }
}

export async function fetchMessagesForSummary(
  chatId: string,
  supabase: SupabaseClient,
  limit: number = 100 // Fetch a good number of recent messages for token analysis
): Promise<Message[]> {
  console.log(`📚 Fetching last ${limit} messages for summary generation for chat:`, chatId);

  const { data: messages, error } = await supabase
    .from('messages')
    .select('content, is_ai_message, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false }) // Get the most recent ones
    .limit(limit);

  if (error) {
    console.error('❌ Error fetching messages for summary:', error);
    return [];
  }

  // The messages are fetched in descending order, so we need to reverse them
  // to get the correct chronological order for the summary.
  const chronologicalMessages = messages.reverse();

  console.log(`✅ Fetched ${chronologicalMessages.length} messages for summary.`);
  return chronologicalMessages;
}
