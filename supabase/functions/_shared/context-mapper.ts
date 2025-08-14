// Shared context mappers between DB (snake_case) and UI/message (camelCase)

export interface DbContext {
  mood?: string | null;
  clothing?: string | null;
  location?: string | null;
  time_weather?: string | null;
  relationship?: string | null;
  character_position?: string | null;
  conversation_tone?: string | null;
  urgency_level?: string | null;
}

export interface UiContext {
  moodTracking?: string;
  clothingInventory?: string;
  locationTracking?: string;
  timeAndWeather?: string;
  relationshipStatus?: string;
  characterPosition?: string;
  conversationTone?: string;
  urgencyLevel?: string;
}

const DEFAULT = 'No context';

export function dbToUi(c: DbContext): UiContext {
  return {
    moodTracking: c.mood ?? DEFAULT,
    clothingInventory: c.clothing ?? DEFAULT,
    locationTracking: c.location ?? DEFAULT,
    timeAndWeather: c.time_weather ?? DEFAULT,
    relationshipStatus: c.relationship ?? DEFAULT,
    characterPosition: c.character_position ?? DEFAULT,
    conversationTone: c.conversation_tone ?? DEFAULT,
    urgencyLevel: c.urgency_level ?? DEFAULT,
  };
}

export function uiToDb(c: UiContext): DbContext {
  return {
    mood: c.moodTracking ?? null,
    clothing: c.clothingInventory ?? null,
    location: c.locationTracking ?? null,
    time_weather: c.timeAndWeather ?? null,
    relationship: c.relationshipStatus ?? null,
    character_position: c.characterPosition ?? null,
    conversation_tone: c.conversationTone ?? null,
    urgency_level: c.urgencyLevel ?? null,
  };
}
