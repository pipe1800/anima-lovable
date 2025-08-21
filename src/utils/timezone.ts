import { supabase } from '@/db/client';

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error('Error getting browser timezone:', error);
    return 'UTC';
  }
}

export async function updateUserTimezone(userId: string, timezone: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ timezone })
    .eq('id', userId);
    
  if (error) {
    console.error('Error updating user timezone:', error);
    return false;
  }
  
  return true;
}
