// Dashboard aggregated data queries (Phase 2)
// Source of truth for dashboard overview RPC usage.
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export interface DashboardOverviewResult {
  characters: any[];
  favorites: any[];
  liked_ids: string[];
  counts: { characters: number; favorites: number; chats: number };
}

export async function getUserDashboardOverview(
  client: SupabaseClient<Database, '__InternalSupabase'>,
  userId: string,
  opts?: { charsLimit?: number; favsLimit?: number },
) {
  try {
    const { data, error } = await (client as any).rpc('get_user_dashboard_overview', {
      p_user_id: userId,
      p_chars_limit: opts?.charsLimit ?? 30,
      p_favs_limit: opts?.favsLimit ?? 30,
    });
    if (error) return { data: null, error };
    const parsed: DashboardOverviewResult = data || { characters: [], favorites: [], liked_ids: [], counts: { characters: 0, favorites: 0, chats: 0 } };
    // Normalize arrays
    return {
      data: {
        characters: Array.isArray(parsed.characters) ? parsed.characters : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        liked_ids: Array.isArray(parsed.liked_ids) ? parsed.liked_ids : [],
        counts: parsed.counts || { characters: 0, favorites: 0, chats: 0 },
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e };
  }
}
