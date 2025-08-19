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

// get_user_snapshot (v1) removed; use bootstrap-store ensureSnapshotLoaded instead.

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

// Helper to seed user snapshot into react-query cache (legacy callers should migrate to bootstrap store)
export const seedUserSnapshot = () => { /* deprecated noop */ };
