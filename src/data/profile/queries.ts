import { supabase } from '@/db/client';
import type { Profile } from '@/types/database';

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

export const getProfileCounts = async (userId: string, includePersonas: boolean) => {
  const [chats, characters, favorites, personas] = await Promise.allSettled([
    supabase.from('chats').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('characters').select('id', { count: 'exact', head: true }).eq('creator_id', userId),
    supabase.from('character_favorites').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    includePersonas ? supabase.from('personas').select('id', { count: 'exact', head: true }).eq('user_id', userId) : Promise.resolve({ count: 0 })
  ]);
  const extract = (r: any) => r.status === 'fulfilled' ? (r.value.count || 0) : 0;
  return {
    chats: extract(chats),
    characters: extract(characters),
    favorites: extract(favorites),
    personas: includePersonas ? extract(personas) : 0,
  };
};

export const isUsernameAvailable = async (username: string, excludeUserId?: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', excludeUserId || '')
    .maybeSingle();
  if (error && (error as any).code === 'PGRST116') {
    return { available: true };
  }
  if (data) return { available: false };
  return { available: true };
};
