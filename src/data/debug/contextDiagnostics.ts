import { supabase } from '@/db/client';

// Debug / diagnostics data accessors (isolated under data layer)

export const fetchChatMessagesForDebug = async (chatId: string, limit = 10) => {
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, current_context, created_at, is_ai_message')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data, error };
};

export const fetchAddonSettings = async (userId: string, characterId: string) => {
  const { data, error } = await (supabase as any)
    .from('user_character_addons')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  return { data, error };
};

export const fetchChatInfo = async (chatId: string) => {
  const { data, error } = await supabase
    .from('chats')
    .select('id, user_id, character_id, created_at')
    .eq('id', chatId)
    .maybeSingle();
  return { data, error };
};

export const fetchExistingChatContexts = async (chatId: string, userId: string, characterId: string) => {
  const { data, error } = await supabase
    .from('chat_context')
    .select('*')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .eq('character_id', characterId);
  return { data, error };
};

export const deleteChatContexts = async (chatId: string, userId: string, characterId: string) => {
  const { error } = await supabase
    .from('chat_context')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .eq('character_id', characterId);
  return { error };
};

export default {
  fetchChatMessagesForDebug,
  fetchAddonSettings,
  fetchChatInfo,
  fetchExistingChatContexts,
  deleteChatContexts,
};
