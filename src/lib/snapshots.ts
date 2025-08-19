import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/queries/chatQueries';

export interface UserSnapshot {
  profile: any;
  subscription: any;
  credits: number;
  counts: { favorites: number; chats: number; characters: number; personas: number };
  characters: any[];
  personas: any[];
}

export const getUserSnapshot = async (userId: string): Promise<UserSnapshot | null> => {
  const { data, error } = await (supabase as any).rpc('get_user_snapshot', { p_user_id: userId });
  if (error) {
    console.error('getUserSnapshot error', error);
    return null;
  }
  return data as UserSnapshot;
};

export interface WorldInfoSnapshot {
  public: any[];
  total: number;
  owned: any[];
  favorited_ids: Array<{ id: string }>;
  used_ids: Array<{ id: string }>;
  tags: Record<string, Array<{ id: number; name: string }>>;
  counts: Record<string, { likes: number; favorites: number; usage: number }>;
}

export const getWorldInfoSnapshot = async (userId: string | null, limit = 24, offset = 0): Promise<WorldInfoSnapshot | null> => {
  const { data, error } = await (supabase as any).rpc('get_world_info_snapshot', { p_user_id: userId, p_limit: limit, p_offset: offset });
  if (error) {
    console.error('getWorldInfoSnapshot error', error);
    return null;
  }
  return data as WorldInfoSnapshot;
};

// Helper to seed user snapshot into react-query cache
export const seedUserSnapshot = (qc: any, userId: string, snap: UserSnapshot) => {
  qc.setQueryData(queryKeys.user.profile(userId), snap.profile);
  // subscription & credits now snapshot-store only; no react-query keys
  qc.setQueryData(queryKeys.user.characters(userId), snap.characters || []);
  qc.setQueryData(queryKeys.user.favorites(userId), []); // counts only; detailed favorites loaded lazily
  qc.setQueryData(queryKeys.personas.list(userId), snap.personas || []);
  qc.setQueryData(queryKeys.user.chatsCount(userId), snap.counts?.chats || 0);
};
