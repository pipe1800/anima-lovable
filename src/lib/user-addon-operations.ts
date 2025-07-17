import { supabase } from '@/integrations/supabase/client';

export interface AddonSettings {
  dynamicWorldInfo: boolean;
  enhancedMemory: boolean;
  moodTracking: boolean;
  clothingInventory: boolean;
  locationTracking: boolean;
  timeAndWeather: boolean;
  relationshipStatus: boolean;
  characterPosition: boolean;
  chainOfThought: boolean;
  fewShotExamples: boolean;
}

export const defaultAddonSettings: AddonSettings = {
  dynamicWorldInfo: false,
  enhancedMemory: false,
  moodTracking: false,
  clothingInventory: false,
  locationTracking: false,
  timeAndWeather: false,
  relationshipStatus: false,
  characterPosition: false,
  chainOfThought: false,
  fewShotExamples: false,
};

/**
 * Get user's addon settings for a specific character
 */
export const getUserCharacterAddonSettings = async (
  userId: string, 
  characterId: string
): Promise<AddonSettings> => {
  try {
    const { data, error } = await supabase
      .from('user_character_addons')
      .select('addon_settings')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching addon settings:', error);
      return defaultAddonSettings;
    }

    if (!data) {
      return defaultAddonSettings;
    }

    return { ...defaultAddonSettings, ...(data.addon_settings as unknown as AddonSettings) };
  } catch (error) {
    console.error('Error fetching addon settings:', error);
    return defaultAddonSettings;
  }
};

/**
 * Save user's addon settings for a specific character
 */
export const saveUserCharacterAddonSettings = async (
  userId: string,
  characterId: string,
  settings: AddonSettings
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('user_character_addons')
      .upsert(
        {
          user_id: userId,
          character_id: characterId,
          addon_settings: settings as any,
        },
        {
          onConflict: 'user_id,character_id'
        }
      );

    if (error) {
      console.error('Error saving addon settings:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving addon settings:', error);
    return { success: false, error: 'Unknown error occurred' };
  }
};

/**
 * Calculate the total credit cost increase based on addon settings
 */
export const calculateAddonCreditCost = (settings: AddonSettings): number => {
  let total = 0;
  if (settings.dynamicWorldInfo) total += 10;
  // Enhanced Memory has dynamic cost - not included in base calculation
  if (settings.moodTracking) total += 5;
  if (settings.clothingInventory) total += 5;
  if (settings.locationTracking) total += 5;
  if (settings.timeAndWeather) total += 5;
  if (settings.relationshipStatus) total += 5;
  if (settings.characterPosition) total += 5;
  if (settings.chainOfThought) total += 30;
  if (settings.fewShotExamples) total += 7;
  return total;
};

/**
 * Check if user has any active addons for a character
 */
export const hasActiveAddons = (settings: AddonSettings): boolean => {
  return Object.values(settings).some(value => value === true);
};

/**
 * Validate addon settings for a specific subscription tier
 */
export const validateAddonSettings = (
  settings: AddonSettings, 
  userPlan: string
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const isGuestPass = userPlan === 'Guest Pass';
  const isTrueFan = userPlan === 'True Fan';
  const isWhale = userPlan === 'The Whale';
  const isTrueFanOrWhale = isTrueFan || isWhale;

  // Debug validation in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Validation Debug:', {
      userPlan,
      isGuestPass,
      isTrueFan,
      isWhale,
      isTrueFanOrWhale,
      settings
    });
  }

  // The Whale gets unlimited access to everything - skip all restrictions
  if (isWhale) {
    console.log('🐋 Whale user detected - all addons available');
    return { valid: true, errors: [] };
  }

  // Enhanced Memory validation (True Fan and Whale only)
  if (settings.enhancedMemory && !isTrueFanOrWhale) {
    errors.push('Enhanced Memory requires True Fan or Whale subscription');
  }

  // Chain of Thought validation (True Fan and Whale only)
  if (settings.chainOfThought && !isTrueFanOrWhale) {
    errors.push('Chain of Thought requires True Fan or Whale subscription');
  }

  // Guest Pass stateful tracking limit - count only enabled addons
  if (isGuestPass) {
    const activeStatefulAddons = [
      settings.moodTracking,
      settings.clothingInventory,
      settings.locationTracking,
      settings.timeAndWeather,
      settings.relationshipStatus,
      settings.characterPosition,
    ].filter(Boolean).length;

    console.log('Guest Pass validation - Active stateful addons:', activeStatefulAddons);
    console.log('Guest Pass validation - Settings:', settings);

    if (activeStatefulAddons > 2) {
      errors.push('Guest Pass users are limited to 2 stateful tracking addons');
    }
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Get addon statistics for debugging/testing
 */
export const getAddonStats = (settings: AddonSettings) => {
  const totalCost = calculateAddonCreditCost(settings);
  const activeCount = Object.values(settings).filter(Boolean).length;
  const activeAddons = Object.entries(settings)
    .filter(([_, enabled]) => enabled)
    .map(([key, _]) => key);

  const statefulCount = [
    settings.moodTracking,
    settings.clothingInventory,
    settings.locationTracking,
    settings.timeAndWeather,
    settings.relationshipStatus,
    settings.characterPosition,
  ].filter(Boolean).length;

  return {
    totalCost,
    activeCount,
    activeAddons,
    statefulCount,
    hasPremiumFeatures: settings.enhancedMemory || settings.chainOfThought,
  };
};