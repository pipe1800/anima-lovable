import { supabase } from "@/integrations/supabase/client";

export interface UserWorldInfoSetting {
  id: string;
  user_id: string;
  character_id: string;
  world_info_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Save user's world info selection for a specific character
 */
export async function saveUserCharacterWorldInfo(
  userId: string,
  characterId: string,
  worldInfoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, remove any existing world info setting for this user-character combination
    await supabase
      .from('user_character_world_info_settings')
      .delete()
      .eq('user_id', userId)
      .eq('character_id', characterId);

    // Insert the new world info setting
    const { error } = await supabase
      .from('user_character_world_info_settings')
      .insert({
        user_id: userId,
        character_id: characterId,
        world_info_id: worldInfoId
      });

    if (error) {
      console.error('Error saving user world info setting:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error saving user world info setting:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get user's world info selection for a specific character
 */
export async function getUserCharacterWorldInfo(
  userId: string,
  characterId: string
): Promise<{ worldInfoId: string | null; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('user_character_world_info_settings')
      .select('world_info_id')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user world info setting:', error);
      return { worldInfoId: null, error: error.message };
    }

    return { worldInfoId: data?.world_info_id || null };
  } catch (error) {
    console.error('Unexpected error fetching user world info setting:', error);
    return { worldInfoId: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Remove user's world info selection for a specific character
 */
export async function removeUserCharacterWorldInfo(
  userId: string,
  characterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('user_character_world_info_settings')
      .delete()
      .eq('user_id', userId)
      .eq('character_id', characterId);

    if (error) {
      console.error('Error removing user world info setting:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error removing user world info setting:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Check if user has access to a specific world info
 * (either owns it or has it in their collection)
 */
export async function canUserAccessWorldInfo(
  userId: string,
  worldInfoId: string
): Promise<{ hasAccess: boolean; error?: string }> {
  try {
    // Check if user owns the world info
    const { data: ownedWorldInfo, error: ownedError } = await supabase
      .from('world_infos')
      .select('id')
      .eq('id', worldInfoId)
      .eq('creator_id', userId)
      .maybeSingle();

    if (ownedError) {
      console.error('Error checking owned world info:', ownedError);
      return { hasAccess: false, error: ownedError.message };
    }

    if (ownedWorldInfo) {
      return { hasAccess: true };
    }

    // Check if user has world info in their collection
    const { data: collectionWorldInfo, error: collectionError } = await supabase
      .from('world_info_users')
      .select('id')
      .eq('user_id', userId)
      .eq('world_info_id', worldInfoId)
      .maybeSingle();

    if (collectionError) {
      console.error('Error checking world info collection:', collectionError);
      return { hasAccess: false, error: collectionError.message };
    }

    return { hasAccess: !!collectionWorldInfo };
  } catch (error) {
    console.error('Unexpected error checking world info access:', error);
    return { hasAccess: false, error: 'An unexpected error occurred' };
  }
}