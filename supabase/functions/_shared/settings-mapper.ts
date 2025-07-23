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
  relationship_status: boolean;
  character_position: boolean;
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
  relationshipStatus?: boolean;
  characterPosition?: boolean;
  chainOfThought?: boolean;
  fewShotExamples?: boolean;
  timeAwareness?: boolean;
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
    relationshipStatus: globalSettings.relationship_status,
    characterPosition: globalSettings.character_position,
    chainOfThought: false, // Temporarily disabled - coming soon
    fewShotExamples: false, // Temporarily disabled - coming soon
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
    relationship_status: addonSettings.relationshipStatus,
    character_position: addonSettings.characterPosition,
    chain_of_thought: false, // Temporarily disabled - coming soon
    few_shot_examples: false, // Temporarily disabled - coming soon
  };
}
