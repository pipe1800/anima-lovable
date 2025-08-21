import { supabase } from '@/db/client';
import { Uploads } from '@/data';

export const getSession = () => supabase.auth.getSession();
export const onAuthStateChange = (callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) => supabase.auth.onAuthStateChange(callback);
export const signInWithOAuth = (provider: 'google' | 'discord', redirectTo?: string) =>
  supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
export const signUpWithEmail = (email: string, password: string, data: Record<string, any>, redirectTo?: string) =>
  supabase.auth.signUp({ email, password, options: { data, emailRedirectTo: redirectTo } });
export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();
export const updateUser = (data: Record<string, any>) => supabase.auth.updateUser({ data });
export const resetPasswordForEmail = (email: string, redirectTo: string) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo });
export const setSession = (access_token: string, refresh_token: string) =>
  supabase.auth.setSession({ access_token, refresh_token });

export const markOnboardingCompleted = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId);
  return { error };
};

// Delegated avatar provisioning (was duplicated). Uses Uploads.ensureDefaultAvatar now.
export const ensureDefaultAvatar = async (userId: string) => {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (profileRow?.avatar_url) return { avatar_url: profileRow.avatar_url };
  const avatarUrl = await Uploads.ensureDefaultAvatar(userId);
  await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);
  return { avatar_url: avatarUrl };
};

export const completeOnboarding = async (userId: string) => {
  await updateUser({ onboarding_completed: true });
  await markOnboardingCompleted(userId);
};

export const ensureDefaultAvatarIfMissing = async (userId: string) => {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (profileRow?.avatar_url) return { avatar_url: profileRow.avatar_url, created: false };
  try {
    const avatarUrl = await Uploads.ensureDefaultAvatar(userId);
    return { avatar_url: avatarUrl, created: true };
  } catch (e) {
    console.warn('Failed to provision default avatar', e);
    return { avatar_url: '/default_avatar.jpg', created: false };
  }
};

export const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  return { data, error };
};
