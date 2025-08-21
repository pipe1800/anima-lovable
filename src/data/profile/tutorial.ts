import { supabase } from '@/db/client';

/**
 * Update onboarding/tutorial completion status for a user profile.
 * Centralized here to avoid direct supabase.from calls inside React contexts/components.
 */
export async function updateTutorialStatus(userId: string, completed: boolean) {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: completed })
    .eq('id', userId);
  if (error) throw error;
}

export const Tutorial = { updateTutorialStatus };
