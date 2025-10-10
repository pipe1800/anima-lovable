import type { PostgrestSingleResponse, PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/db/client';
import { callRpc } from '@/db/rpc';
import type { Json } from '@/integrations/supabase/types';
import { convertDatabaseContextToTrackedContext } from '@/utils/contextConverter';

// CONSOLIDATED CHAT DOMAIN NOTE (2025-08-21):
// - getChatContextRPC REMOVED (use getChatSnapshot for initial load or getChatContext / getChatContextEnhanced)
// - getChatMessagesForStats REMOVED (stats now provided by getChatSnapshot)
// - messages/queries.ts deprecated; updateMessageContent centralized here
// - Use getChatSnapshot to minimize round trips (messages + context + mode + summary stats)

type DeleteChatResponse = PostgrestSingleResponse<Json | null>;

export const deleteChat = (chatId: string, userId: string): Promise<DeleteChatResponse> =>
  callRpc<Json | null>(supabase, 'delete_chat_complete', {
    p_chat_id: chatId,
    p_user_id: userId,
  });

export const deleteMultipleChats = async (chatIds: string[], userId: string) => {
  const results: DeleteChatResponse[] = [];
  const batchSize = 3;
  for (let i = 0; i < chatIds.length; i += batchSize) {
    const batch = chatIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(chatId => deleteChat(chatId, userId)));
    results.push(...batchResults);
    if (i + batchSize < chatIds.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 200));
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
  const chatRows = (allChats ?? []) as Array<{ id: string }>;
  if (!chatRows.length) return { success: true, error: null, deletedCount: 0 };
  const chatIds = chatRows.map(c => c.id);
  const results = await deleteMultipleChats(chatIds, userId);
  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  return { success: errorCount === 0, error: errorCount ? `Failed ${errorCount}` : null, deletedCount: successCount };
};

interface UserChatRow {
  chat_id: string;
  character_id: string;
  chat_created_at: string;
  chat_updated_at: string;
  character_name: string;
  character_avatar_url: string | null;
  last_message_id: string | null;
  last_message_created_at: string | null;
  last_message_is_ai: boolean | null;
  last_message_content: string | null;
  message_count: number | null;
  total_count?: number | null;
}

interface UserChatSummary {
  chat_id: string;
  character_id: string;
  chat_created_at: string;
  chat_updated_at: string;
  character_name: string;
  character_avatar_url: string | null;
  last_message: {
    id: string;
    created_at: string | null;
    is_ai: boolean | null;
    content: string | null;
  } | null;
  message_count: number;
}

interface UserChatsPaginatedResponse {
  data: UserChatSummary[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  error: PostgrestError | null;
}

export const getUserChatsPaginated = async (
  userId: string,
  page = 1,
  limit = 20,
): Promise<UserChatsPaginatedResponse> => {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const offset = (page - 1) * safeLimit;
  const { data, error } = await callRpc<UserChatRow[]>(supabase, 'get_user_chats', {
    p_limit: safeLimit,
    p_offset: offset,
  });

  if (error || !data) {
    return { data: [], totalCount: 0, currentPage: page, totalPages: 0, hasMore: false, error };
  }

  const total = data.length ? Number(data[0].total_count ?? 0) : 0;
  const chats: UserChatSummary[] = data.map((row) => ({
    chat_id: row.chat_id,
    character_id: row.character_id,
    chat_created_at: row.chat_created_at,
    chat_updated_at: row.chat_updated_at,
    character_name: row.character_name,
    character_avatar_url: row.character_avatar_url,
    last_message: row.last_message_id
      ? {
          id: row.last_message_id,
          created_at: row.last_message_created_at,
          is_ai: row.last_message_is_ai,
          content: row.last_message_content,
        }
      : null,
    message_count: row.message_count ?? 0,
  }));

  return {
    data: chats,
    totalCount: total,
    currentPage: page,
    totalPages: safeLimit ? Math.ceil(total / safeLimit) : 0,
    hasMore: offset + safeLimit < total,
    error: null,
  };
};

interface ChatMessageRow {
  id: string;
  content: string | null;
  created_at: string;
  message_order: number;
  is_ai_message: boolean | null;
  has_more?: boolean;
}

export const getChatMessages = async (chatId: string, limit = 30, beforeOrder?: number) => {
  const { data, error } = await callRpc<ChatMessageRow[]>(supabase, 'get_chat_messages', {
    p_chat_id: chatId,
    p_limit: limit,
    p_before_order: beforeOrder ?? null,
  });

  if (error || !data) return { data: [], hasMore: false, error };
  const hasMore = data.length ? Boolean(data[0].has_more) : false;
  return { data, hasMore, error: null };
};

// NEW: centralized helper to upsert chat context (used by ChatInterface manual seed)
export const upsertChatContext = async (args: {
  chatId: string;
  userId: string;
  characterId: string;
  currentContext: Record<string, Json | undefined>;
}) => {
  const { chatId, userId, characterId, currentContext } = args;
  return supabase.from('chat_context').upsert({
    chat_id: chatId,
    user_id: userId,
    character_id: characterId,
    current_context: currentContext,
  }, { onConflict: 'chat_id' });
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
  current_context: Record<string, Json> | null;
  messages: Array<{
    id: string;
    content: string | null;
    is_ai_message: boolean | null;
    created_at: string;
    message_order: number;
    current_context?: Record<string, Json> | null;
  }>;
  has_more: boolean;
  last_summary_at: number;
  ai_messages_after_summary: number;
  page_limit: number;
  before_order: number | null;
}

export const getChatSnapshot = async (chatId: string, userId: string, characterId: string, options?: { limit?: number; beforeOrder?: number | null; }) => {
  if (!chatId || !userId || !characterId) return { data: null, error: new Error('Missing parameters') };
  try {
    const { data, error } = await callRpc<ChatSnapshotResult>(supabase, 'get_chat_snapshot', {
      p_chat_id: chatId,
      p_user_id: userId,
      p_character_id: characterId,
      p_limit: options?.limit ?? 25,
      p_before_order: options?.beforeOrder ?? null,
    });
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (error: unknown) {
    return { data: null, error };
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
  const typedData = (data as { current_context: Record<string, Json> | null } | null) ?? null;
  return { data: typedData, error };
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
