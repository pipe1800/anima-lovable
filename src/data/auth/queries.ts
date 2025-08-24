import { supabase } from '@/db/client';

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

// Returns authenticated user or null (no error throw)
export const getAuthUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, error } as const;
  return { user: data.user, error: null } as const;
};

// Helper to enforce authentication (throws if unauthenticated)
export const requireAuthId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not authenticated');
  return data.user.id;
};
