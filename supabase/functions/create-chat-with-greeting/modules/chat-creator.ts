/**
 * Chat Creator Module
 * 
 * Handles chat creation, database operations, and metadata management
 * for the create-chat-with-greeting function.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

import type { CreateChatRequest } from '../types/interfaces.ts';

export interface ChatCreationResult {
  chat: {
    id: string;
    user_id: string;
    character_id: string;
    title: string;
    created_at: string;
    updated_at: string;
  };
  character: any;
}

export interface UserData {
  profile: any;
  persona: any;
}

/**
 * Fetch user profile and default persona in parallel
 */
export async function fetchUserData(userId: string, supabase: SupabaseClient): Promise<UserData> {
  console.log('📊 Fetching user profile and persona...');
  
  const [profileResult, personaResult] = await Promise.allSettled([
    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single(),
    supabase
      .from('personas')
      .select('name')
      .eq('user_id', userId)
      .limit(1)
      .single()
  ]);

  const profile = profileResult.status === 'fulfilled' ? profileResult.value.data : null;
  const persona = personaResult.status === 'fulfilled' ? personaResult.value.data : null;

  if (profileResult.status === 'rejected') {
    console.error('❌ Error fetching user profile:', profileResult.reason);
  }
  
  if (personaResult.status === 'rejected' && personaResult.reason?.code !== 'PGRST116') {
    console.error('❌ Error fetching default persona:', personaResult.reason);
  }

  console.log('✅ User data fetched:', {
    hasProfile: !!profile,
    hasPersona: !!persona,
    username: profile?.username,
    personaName: persona?.name
  });

  return { profile, persona };
}

/**
 * Fetch character details with definitions
 */
export async function fetchCharacterDetails(characterId: string, supabase: SupabaseClient) {
  console.log('📊 Fetching character details...');
  
  const { data: character, error } = await supabase
    .from('characters')
    .select(`
      *,
      character_definitions (*)
    `)
    .eq('id', characterId)
    .single();

  if (error) {
    console.error('❌ Error fetching character:', error);
    throw new Error('Failed to fetch character details');
  }

  console.log('✅ Character details fetched:', {
    hasDefinitions: !!character.character_definitions,
    greeting: character.character_definitions?.greeting?.substring(0, 50)
  });

  return character;
}

/**
 * Create a new chat with proper metadata
 */
export async function createChat(
  userId: string, 
  characterId: string, 
  characterName: string, 
  supabase: SupabaseClient
): Promise<any> {
  console.log('💾 Creating new chat...');
  
  const now = new Date().toISOString();
  
  const { data: chat, error } = await supabase
    .from('chats')
    .insert({
      user_id: userId,
      character_id: characterId,
      title: `Chat with ${characterName}`,
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating chat:', error);
    throw new Error('Failed to create chat');
  }

  console.log('✅ Chat created:', chat.id);
  return chat;
}

/**
 * Update chat with last message timestamp
 */
export async function updateChatTimestamp(chatId: string, supabase: SupabaseClient): Promise<void> {
  console.log('🕐 Updating chat timestamp...');
  
  const { error } = await supabase
    .from('chats')
    .update({
      last_message_at: new Date().toISOString()
    })
    .eq('id', chatId);

  if (error) {
    console.error('❌ Error updating chat timestamp:', error);
    // Don't throw - this is not critical
  } else {
    console.log('✅ Chat timestamp updated');
  }
}

/**
 * Create the initial greeting message with context
 */
export async function createGreetingMessage(
  chatId: string,
  greetingContent: string,
  messageContext: Record<string, any>,
  supabase: SupabaseClient
): Promise<void> {
  console.log('💾 Creating greeting message with context:', messageContext);
  
  const { error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      author_id: null,
      content: greetingContent,
      is_ai_message: true,
      current_context: Object.keys(messageContext).length > 0 ? messageContext : null,
      message_order: 1,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('❌ Error creating greeting message:', error);
    throw new Error('Failed to create greeting message');
  }

  console.log('✅ Greeting message created for chat:', chatId);
}

/**
 * Complete chat creation workflow
 */
export async function createChatWithGreeting(
  request: CreateChatRequest,
  userId: string,
  supabase: SupabaseClient
): Promise<ChatCreationResult> {
  const { character_id, character_name } = request;
  
  console.log('🚀 Starting chat creation workflow for user:', userId, 'character:', character_id);

  // Create chat and fetch character details in parallel
  const [chat, character] = await Promise.all([
    createChat(userId, character_id, character_name, supabase),
    fetchCharacterDetails(character_id, supabase)
  ]);

  // Update chat timestamp (non-blocking)
  updateChatTimestamp(chat.id, supabase).catch(error => {
    console.error('⚠️ Failed to update chat timestamp:', error);
  });

  return { chat, character };
}
