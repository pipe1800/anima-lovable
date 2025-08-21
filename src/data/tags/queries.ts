import { supabase } from '@/db/client';
import type { Tables } from '@/integrations/supabase/types';

export type Tag = Tables<'tags'>;

export const getAllTags = async () => {
  const { data, error } = await supabase.from('tags').select('*').order('name');
  return { data, error };
};

export const getTagNames = async () => {
  const { data, error } = await supabase.from('tags').select('name').order('name');
  return { data: (data || []).map((t: any) => t.name), error };
};

export const getNSFWTag = async () => {
  const { data, error } = await supabase.from('tags').select('*').ilike('name', 'nsfw').limit(1);
  return { data: (data && data[0]) || null, error };
};
