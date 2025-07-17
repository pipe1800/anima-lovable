/**
 * Capitalizes the first letter of each sentence and handles proper nouns
 */
export function capitalizeText(text: string): string {
  if (!text || text === 'No context') return text;
  
  // Split by sentence endings and process each sentence
  return text
    .split(/([.!?]+\s*)/)
    .map((part, index) => {
      // Skip punctuation parts
      if (/^[.!?\s]+$/.test(part)) return part;
      
      // Capitalize first letter of each sentence
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Get user-friendly label for context keys
 */
export const getContextLabel = (key: string): string => {
  const labels: Record<string, string> = {
    moodTracking: 'Mood Tracking',
    clothingInventory: 'Clothing Inventory',
    locationTracking: 'Location Tracking',
    timeAndWeather: 'Time & Weather',
    relationshipStatus: 'Relationship Status',
    characterPosition: 'Character Position',
  };
  
  return labels[key] || key;
};

/**
 * Map database context types to addon keys
 */
export const getAddonKey = (itemKey: string): string => {
  const mapping: Record<string, string> = {
    'mood': 'moodTracking',
    'clothing': 'clothingInventory',
    'location': 'locationTracking',
    'time_weather': 'timeAndWeather',
    'relationship': 'relationshipStatus',
    'character_position': 'characterPosition',
  };
  
  return mapping[itemKey] || itemKey;
};

/**
 * Filter context items to only include character-relevant data
 */
export const filterCharacterRelevantContext = (context: any): any => {
  const filtered: any = {};
  
  // Include context that's relevant to character state
  if (context.moodTracking) filtered.moodTracking = context.moodTracking;
  if (context.clothingInventory) filtered.clothingInventory = context.clothingInventory;
  if (context.locationTracking) filtered.locationTracking = context.locationTracking;
  if (context.timeAndWeather) filtered.timeAndWeather = context.timeAndWeather;
  if (context.relationshipStatus) filtered.relationshipStatus = context.relationshipStatus;
  if (context.characterPosition) filtered.characterPosition = context.characterPosition;
  
  return filtered;
};

/**
 * Filters context to focus on character-relevant information
 */
export function isCharacterRelevantContext(contextKey: string, value: string): boolean {
  if (!value || value === 'No context') return false;
  
  // Always include shared environmental context
  if (contextKey === 'timeAndWeather' || contextKey === 'locationTracking' || contextKey === 'characterPosition') {
    return true;
  }
  
  // For other context types, filter out user-specific content
  const lowerValue = value.toLowerCase();
  const userIndicators = ['you are', 'user is', 'your mood', 'you feel', 'you\'re wearing', 'you have on'];
  
  // If it contains user indicators, skip it (unless it also mentions the character)
  const hasUserIndicators = userIndicators.some(indicator => lowerValue.includes(indicator));
  const hasCharacterIndicators = lowerValue.includes('character') || lowerValue.includes('they') || lowerValue.includes('their');
  
  // Include if it's character-focused or shared context
  return !hasUserIndicators || hasCharacterIndicators;
}