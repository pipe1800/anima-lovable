import type { TrackedContext } from '@/types/chat';

// Database context format (from chat_context.current_context)
export interface DatabaseContext {
  mood?: string | null;
  clothing?: string | null;
  location?: string | null;
  time_weather?: string | null;
  relationship?: string | null;
  character_position?: string | null;
  enchantment_status?: string | null; // NEW
  item_inventory?: string | null; // NEW
}

/**
 * Convert database context format to frontend TrackedContext format
 */
export function convertDatabaseContextToTrackedContext(dbContext: any): TrackedContext | null {
  if (!dbContext || typeof dbContext !== 'object') {
    return null;
  }

  // Check if it's already in TrackedContext format
  if ('moodTracking' in dbContext) {
    return {
      moodTracking: (dbContext.moodTracking && dbContext.moodTracking !== 'No context') ? dbContext.moodTracking : 'No context',
      clothingInventory: (dbContext.clothingInventory && dbContext.clothingInventory !== 'No context') ? dbContext.clothingInventory : 'No context',
      locationTracking: (dbContext.locationTracking && dbContext.locationTracking !== 'No context') ? dbContext.locationTracking : 'No context',
      timeAndWeather: (dbContext.timeAndWeather && dbContext.timeAndWeather !== 'No context') ? dbContext.timeAndWeather : 'No context',
      relationshipStatus: (dbContext.relationshipStatus && dbContext.relationshipStatus !== 'No context') ? dbContext.relationshipStatus : 'No context',
      characterPosition: (dbContext.characterPosition && dbContext.characterPosition !== 'No context') ? dbContext.characterPosition : 'No context',
      enchantmentStatus: (dbContext.enchantmentStatus && dbContext.enchantmentStatus !== 'No context') ? dbContext.enchantmentStatus : 'No context',
      itemInventory: (dbContext.itemInventory && dbContext.itemInventory !== 'No context') ? dbContext.itemInventory : 'No context'
    };
  }

  // Convert database field names to frontend field names
  const result = {
    moodTracking: (dbContext.mood && dbContext.mood !== 'No context') ? dbContext.mood : 'No context',
    clothingInventory: (dbContext.clothing && dbContext.clothing !== 'No context') ? dbContext.clothing : 'No context',
    locationTracking: (dbContext.location && dbContext.location !== 'No context') ? dbContext.location : 'No context',
    timeAndWeather: (dbContext.time_weather && dbContext.time_weather !== 'No context') ? dbContext.time_weather : 'No context',
    relationshipStatus: (dbContext.relationship && dbContext.relationship !== 'No context') ? dbContext.relationship : 'No context',
    characterPosition: (dbContext.character_position && dbContext.character_position !== 'No context') ? dbContext.character_position : 'No context',
    enchantmentStatus: (dbContext.enchantment_status && dbContext.enchantment_status !== 'No context') ? dbContext.enchantment_status : 'No context',
    itemInventory: (dbContext.item_inventory && dbContext.item_inventory !== 'No context') ? dbContext.item_inventory : 'No context'
  };
  
  return result;
}

/**
 * Convert frontend TrackedContext format to database context format
 */
export function convertTrackedContextToDatabaseContext(trackedContext: TrackedContext): DatabaseContext {
  return {
    mood: (trackedContext.moodTracking && trackedContext.moodTracking !== 'No context') ? trackedContext.moodTracking : null,
    clothing: (trackedContext.clothingInventory && trackedContext.clothingInventory !== 'No context') ? trackedContext.clothingInventory : null,
    location: (trackedContext.locationTracking && trackedContext.locationTracking !== 'No context') ? trackedContext.locationTracking : null,
    time_weather: (trackedContext.timeAndWeather && trackedContext.timeAndWeather !== 'No context') ? trackedContext.timeAndWeather : null,
    relationship: (trackedContext.relationshipStatus && trackedContext.relationshipStatus !== 'No context') ? trackedContext.relationshipStatus : null,
    character_position: (trackedContext.characterPosition && trackedContext.characterPosition !== 'No context') ? trackedContext.characterPosition : null,
    enchantment_status: (trackedContext.enchantmentStatus && trackedContext.enchantmentStatus !== 'No context') ? trackedContext.enchantmentStatus : null,
    item_inventory: (trackedContext.itemInventory && trackedContext.itemInventory !== 'No context') ? trackedContext.itemInventory : null
  };
}

/**
 * Check if a context object has any meaningful values (not just "No context" values)
 */
export function hasValidContext(context: TrackedContext | DatabaseContext | null | undefined): boolean {
  if (!context || typeof context !== 'object') return false;
  
  // Check for TrackedContext format
  if ('moodTracking' in context) {
    const trackedContext = context as TrackedContext;
    return Object.values(trackedContext).some(value => 
      value && value !== 'No context' && typeof value === 'string' && value.trim() !== ''
    );
  }
  
  // Check for DatabaseContext format
  const dbContext = context as DatabaseContext;
  return Object.values(dbContext).some(value => 
    value && value !== 'No context' && typeof value === 'string' && value.trim() !== ''
  );
}
