import { supabase } from '@/db/client';
import { Billing } from '@/data';

export interface ProfileStatsResult {
  characterCount: number;
  chatCount: number;
  creditsBalance: number;
  followersCount: number; // Placeholder for future implementation
}

export const getProfileStats = async (userId: string): Promise<ProfileStatsResult> => {
  const { count: characterCount } = await supabase
    .from('characters')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', userId);

  const { count: chatCount } = await supabase
    .from('chats')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Unified credit retrieval through Billing data layer
  let creditsBalance = 0;
  try {
    const { data } = await Billing.getUserCredits(supabase as any, userId);
    creditsBalance = data?.balance ?? 0;
  } catch (e) {
    // Fallback to RPC only if needed (legacy path)
    try {
      const { data: creditsData } = await supabase.rpc('get_user_credits', { p_user_id: userId });
      creditsBalance = typeof creditsData === 'number' ? creditsData : 0;
    } catch { /* swallow */ }
  }

  return {
    characterCount: characterCount || 0,
    chatCount: chatCount || 0,
    creditsBalance,
    followersCount: 0,
  };
};
