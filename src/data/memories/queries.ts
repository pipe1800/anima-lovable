import { supabase } from '@/db/client';

export interface MemoryUpdateInput {
  summary_content: string;
  trigger_keywords: string[];
  content_hash: string;
}

export const updateMemory = async (id: string, input: MemoryUpdateInput) => {
  const { summary_content, trigger_keywords, content_hash } = input;
  const { error } = await supabase
    .from('character_memories')
    .update({
      summary_content,
      trigger_keywords,
      content_hash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return { error };
};

export const deleteMemory = async (id: string) => {
  const { error } = await supabase
    .from('character_memories')
    .delete()
    .eq('id', id);
  return { error };
};

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
