import { supabase } from '@/db/client';
import { convertDatabaseContextToTrackedContext } from '@/utils/contextConverter';

// CONSOLIDATED CHAT DOMAIN NOTE (2025-08-21):
// - getChatContextRPC REMOVED (use getChatSnapshot for initial load or getChatContext / getChatContextEnhanced)
// - getChatMessagesForStats REMOVED (stats now provided by getChatSnapshot)
// - messages/queries.ts deprecated; updateMessageContent centralized here
// - Use getChatSnapshot to minimize round trips (messages + context + mode + summary stats)

export const deleteChat = async (chatId: string, userId: string) => {
  try {
    const { data, error } = await (supabase as any).rpc('delete_chat_complete', {
      p_chat_id: chatId,
      p_user_id: userId,
    });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const deleteMultipleChats = async (chatIds: string[], userId: string) => {
  const results: Array<{ data: any; error: any }> = [];
  const batchSize = 3;
  for (let i = 0; i < chatIds.length; i += batchSize) {
    const batch = chatIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(chatId => deleteChat(chatId, userId)));
    results.push(...batchResults);
    if (i + batchSize < chatIds.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return results;
};

export const deleteAllUserChats = async (userId: string) => {
  const { data: allChats, error: fetchError } = await supabase
    .from('chats')
    .select('id')
    .eq('user_id', userId);
  if (fetchError) return { success: false, error: fetchError, deletedCount: 0 };
  if (!allChats?.length) return { success: true, error: null, deletedCount: 0 };
  const chatIds = allChats.map(c => c.id);
  const results = await deleteMultipleChats(chatIds, userId);
  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  return { success: errorCount === 0, error: errorCount ? `Failed ${errorCount}` : null, deletedCount: successCount };
};

export const getUserChatsPaginated = async (userId: string, page = 1, limit = 20) => {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const offset = (page - 1) * safeLimit;
  const { data, error } = await (supabase as any).rpc('get_user_chats', { p_limit: safeLimit, p_offset: offset });
  const rows = (data || []) as any[];
  if (error) return { data: [], totalCount: 0, currentPage: page, totalPages: 0, hasMore: false, error };
  const total = rows.length ? rows[0].total_count || 0 : 0;
  const chats = rows.map(row => ({
    chat_id: row.chat_id,
    character_id: row.character_id,
    chat_created_at: row.chat_created_at,
    chat_updated_at: row.chat_updated_at,
    character_name: row.character_name,
    character_avatar_url: row.character_avatar_url,
    last_message: row.last_message_id ? {
      id: row.last_message_id,
      created_at: row.last_message_created_at,
      is_ai: row.last_message_is_ai,
      content: row.last_message_content,
    } : null,
    message_count: row.message_count || 0,
  }));
  return { data: chats, totalCount: total, currentPage: page, totalPages: safeLimit ? Math.ceil(total / safeLimit) : 0, hasMore: offset + safeLimit < total, error: null };
};

export const getChatMessages = async (chatId: string, limit = 30, beforeOrder?: number) => {
  const { data, error } = await (supabase as any)
    .rpc('get_chat_messages', { p_chat_id: chatId, p_limit: limit, p_before_order: beforeOrder ?? null });
  if (error) return { data: [], hasMore: false, error };
  const rows = (data || []) as any[];
  const hasMore = rows.length ? !!rows[0].has_more : false;
  return { data: rows, hasMore, error: null };
};

// NEW: centralized helper to upsert chat context (used by ChatInterface manual seed)
export const upsertChatContext = async (args: { chatId: string; userId: string; characterId: string; currentContext: Record<string, any>; }) => {
  const { chatId, userId, characterId, currentContext } = args;
  return supabase.from('chat_context').upsert({
    chat_id: chatId,
    user_id: userId,
    character_id: characterId,
    current_context: currentContext as any
  }, { onConflict: 'chat_id' as any });
};

// NEW: Fetch chat mode (centralized)
export const getChatMode = async (chatId: string, userId: string) => {
  if (!chatId || !userId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('chats')
    .select('chat_mode')
    .eq('id', chatId)
    .eq('user_id', userId)
    .single();
  return { data, error };
};

// Enhanced context accessor (returns both raw row and converted tracked context)
export const getChatContextEnhanced = async (chatId: string, userId: string, characterId: string) => {
  const { data, error } = await getChatContext({ chatId, userId, characterId });
  const trackedContext = data?.current_context ? convertDatabaseContextToTrackedContext(data.current_context) : null;
  return { data, trackedContext, error };
};

// Snapshot RPC: combines first page of messages + context + mode + summary stats
// Returns raw JSON from RPC. Frontend mapping performed in hooks (e.g., useChatUnified).
export interface ChatSnapshotResult {
  chat_id: string;
  chat_mode: string | null;
  current_context: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  messages: Array<{ id: string; content: string | null; is_ai_message: boolean | null; created_at: string; message_order: number; current_context?: any; }>;
  has_more: boolean;
  last_summary_at: number;
  ai_messages_after_summary: number;
  page_limit: number;
  before_order: number | null;
}

export const getChatSnapshot = async (chatId: string, userId: string, characterId: string, options?: { limit?: number; beforeOrder?: number | null; }) => {
  if (!chatId || !userId || !characterId) return { data: null, error: new Error('Missing parameters') };
  try {
    const { data, error } = await (supabase as any).rpc('get_chat_snapshot', {
      p_chat_id: chatId,
      p_user_id: userId,
      p_character_id: characterId,
      p_limit: options?.limit ?? 25,
      p_before_order: options?.beforeOrder ?? null
    });
    if (error) return { data: null, error };
    return { data: data as ChatSnapshotResult, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Existing direct table fetch (canonical lightweight accessor)
export const getChatContext = async (args: { chatId: string; userId: string; characterId: string }) => {
  const { chatId, userId, characterId } = args;
  if (!chatId || !userId || !characterId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('chat_context')
    .select('current_context')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  return { data, error };
};

// Centralized message content update (moved from messages/queries.ts)
export const updateMessageContent = async (messageId: string, content: string) => {
  const { error } = await supabase
    .from('messages')
    .update({ content })
    .eq('id', messageId);
  return { error };
};

// Memory operations (migrated from memories/queries.ts) ---------------------------------
export interface MemoryUpdateInput { summary_content: string; trigger_keywords: string[]; content_hash: string; }
export const updateMemory = async (id: string, input: MemoryUpdateInput) => {
  const { summary_content, trigger_keywords, content_hash } = input;
  const { error } = await supabase
    .from('character_memories')
    .update({ summary_content, trigger_keywords, content_hash, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};
export const deleteMemory = async (id: string) => {
  const { error } = await supabase.from('character_memories').delete().eq('id', id); return { error }; };
export const getLatestAutoSummary = async (chatId: string) => {
  const { data, error } = await supabase
    .from('character_memories')
    .select('message_count, is_auto_summary')
    .eq('chat_id', chatId)
    .eq('is_auto_summary', true)
    .order('message_count', { ascending: false })
    .limit(1);
  return { data, error };
};

// NOTE: Ensure any imports referencing deprecated paths are updated:
//  - '@/data/chat/context' -> use getChatContext or getChatSnapshot from '@/data/chats/queries'
//  - '@/data/messages/queries' -> use updateMessageContent from '@/data/chats/queries'
