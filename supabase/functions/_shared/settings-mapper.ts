/**
 * Mapping utilities between frontend global settings (snake_case) and backend addon settings (camelCase)
 */

export interface GlobalChatSettings {
  dynamic_world_info: boolean;
  enhanced_memory: boolean;
  mood_tracking: boolean;
  clothing_inventory: boolean;
  location_tracking: boolean;
  time_and_weather: boolean;
  relationship_status: boolean; // RESTORED
  character_position: boolean;
  god_mode: boolean; // NEW: when true, user statements override context immediately
  chain_of_thought: boolean;
  few_shot_examples: boolean;
  streaming_mode: 'instant' | 'smooth';
  font_size: 'small' | 'normal' | 'large';
}

export interface AddonSettings {
  dynamicWorldInfo?: boolean;
  enhancedMemory?: boolean;
  moodTracking?: boolean;
  clothingInventory?: boolean;
  locationTracking?: boolean;
  timeAndWeather?: boolean;
  relationshipStatus?: boolean; // RESTORED (ignored when template enabled)
  characterPosition?: boolean;
  chainOfThought?: boolean;
  fewShotExamples?: boolean;
  timeAwareness?: boolean;
  godMode?: boolean; // NEW: runtime toggle giving user absolute authority
}

/**
 * Converts global settings (snake_case) to addon settings (camelCase)
 */
export function mapGlobalSettingsToAddonSettings(globalSettings: Partial<GlobalChatSettings>): AddonSettings {
  return {
    dynamicWorldInfo: globalSettings.dynamic_world_info,
    enhancedMemory: globalSettings.enhanced_memory,
    moodTracking: globalSettings.mood_tracking,
    clothingInventory: globalSettings.clothing_inventory,
    locationTracking: globalSettings.location_tracking,
    timeAndWeather: globalSettings.time_and_weather,
    relationshipStatus: globalSettings.relationship_status, // restored
    characterPosition: globalSettings.character_position,
    godMode: globalSettings.god_mode,
    chainOfThought: false,
    fewShotExamples: false,
  };
}

/**
 * Converts addon settings (camelCase) to global settings (snake_case)
 */
export function mapAddonSettingsToGlobalSettings(addonSettings: AddonSettings): Partial<GlobalChatSettings> {
  return {
    dynamic_world_info: addonSettings.dynamicWorldInfo,
    enhanced_memory: addonSettings.enhancedMemory,
    mood_tracking: addonSettings.moodTracking,
    clothing_inventory: addonSettings.clothingInventory,
    location_tracking: addonSettings.locationTracking,
    time_and_weather: addonSettings.timeAndWeather,
    relationship_status: addonSettings.relationshipStatus, // restored
    character_position: addonSettings.characterPosition,
    god_mode: addonSettings.godMode,
    chain_of_thought: false,
    few_shot_examples: false,
  };
}

export const ADDON_DB_KEYS = [
  'dynamic_world_info',
  'enhanced_memory',
  'mood_tracking',
  'clothing_inventory',
  'location_tracking',
  'time_and_weather',
  'relationship_status', // restored
  'character_position',
] as const;

export const ADDON_RUNTIME_KEYS = [
  'dynamicWorldInfo',
  'enhancedMemory',
  'moodTracking',
  'clothingInventory',
  'locationTracking',
  'timeAndWeather',
  'relationshipStatus', // restored
  'characterPosition',
  'timeAwareness',
  'godMode',
] as const;

export type AddonDbKey = typeof ADDON_DB_KEYS[number];
export type AddonRuntimeKey = typeof ADDON_RUNTIME_KEYS[number];

export function anyAddonEnabled(addonSettings: Partial<AddonSettings> | null | undefined): boolean {
  if (!addonSettings) return false;
  return ADDON_RUNTIME_KEYS.some((k) => (addonSettings as any)[k]);
}

export function sanitizeAddonSettings(input: any): AddonSettings {
  const out: AddonSettings = {};
  for (const key of ADDON_RUNTIME_KEYS) {
    if (input && Object.prototype.hasOwnProperty.call(input, key)) {
      (out as any)[key] = !!input[key];
    }
  }
  return out;
}
