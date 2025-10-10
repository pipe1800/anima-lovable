import { supabase } from '@/db/client';
import type { Profile } from '@/types/database';
import { Uploads } from '@/data';

// Consolidated profile mutations (onboarding)
export const completeOnboarding = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId);
  return { error };
};

export const getPublicProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url, bio, created_at')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
};

export const getPrivateProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
};

export const updateProfile = async (userId: string, updates: Partial<Profile>) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, username, avatar_url, banner_url, bio, created_at, timezone')
    .maybeSingle();
  return { data, error };
};

export const isUsernameAvailable = async (username: string, excludeUserId?: string | null) => {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return { available: false };

  const query = supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', normalized);

  if (excludeUserId) {
    query.neq('id', excludeUserId);
  }

  const { count, error } = await query;
  if (error) throw error;

  return { available: !count || count === 0 };
};

// Ensure avatar exists (idempotent) and persist to profile.
export const ensureUserAvatar = async (userId: string) => {
  const { data: existing } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (existing?.avatar_url) return { avatar_url: existing.avatar_url, created: false };
  try {
    const url = await Uploads.ensureDefaultAvatar(userId);
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
    return { avatar_url: url, created: true };
  } catch (e) {
    console.warn('ensureUserAvatar failed, using fallback', e);
    return { avatar_url: '/default_avatar.jpg', created: false };
  }
};

// ---------------------------------------------------------------------------
// RPC wrappers
// ---------------------------------------------------------------------------
export interface PublicProfileOverviewResult { profile: any; counts: { chats: number; characters: number; favorites: number; personas?: number }; }

export const getPublicProfileOverview = async (targetUserId: string) => {
  try {
    const { data, error } = await (supabase as any).rpc('get_public_profile_overview', { p_target_user_id: targetUserId });
    return { data: data as PublicProfileOverviewResult | null, error };
  } catch (error) {
    return { data: null, error };
  }
};
