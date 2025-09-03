import { supabase } from '@/db/client';

// Lightweight row interfaces
export interface ChatContextRow { id?: string; chat_id: string; user_id?: string; character_id?: string; created_at?: string; current_context?: Record<string, any> | null; }

export async function fetchRecentChatContext(chatId: string) {
  const { data, error } = await supabase
    .from('chat_context')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(5);
  return { data: data as ChatContextRow[] | null, error };
}

export async function refetchContextCurrent(chatId: string) {
  const { data, error } = await supabase
    .from('chat_context')
    .select('current_context')
    .eq('chat_id', chatId)
    .maybeSingle();
  return { data, error };
}

export async function updateMessageCurrentContext(messageId: string, context: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('messages')
    .update({ current_context: context as any })
    .eq('id', messageId);
  return { error };
}

export async function insertOrReplaceChatContext(args: { chatId: string; userId: string; characterId: string; currentContext: Record<string, any>; }) {
  const { chatId, userId, characterId, currentContext } = args;
  return supabase.from('chat_context').upsert({
    chat_id: chatId,
    user_id: userId,
    character_id: characterId,
    current_context: currentContext as any,
  }, { onConflict: 'chat_id' as any });
}

export default {
  fetchRecentChatContext,
  refetchContextCurrent,
  updateMessageCurrentContext,
  insertOrReplaceChatContext,
};
