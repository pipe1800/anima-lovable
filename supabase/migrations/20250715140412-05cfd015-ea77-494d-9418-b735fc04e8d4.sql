-- Phase 1: Fix Database Inconsistency - Standardize timeAndWeather field names
-- This ensures consistent field naming across all tables and functions

-- Update any existing context records that might have the wrong context_type
UPDATE user_chat_context 
SET context_type = 'time_weather' 
WHERE context_type = 'timeAndWeather';

-- Update any existing message context records
UPDATE message_context 
SET context_updates = context_updates - 'timeWeather' || 
    CASE WHEN context_updates ? 'timeWeather' 
    THEN jsonb_build_object('timeAndWeather', context_updates->'timeWeather') 
    ELSE '{}'::jsonb END
WHERE context_updates ? 'timeWeather';

-- Phase 2: Replace aggressive context cleanup with gentle cleanup
-- Remove the old aggressive trigger
DROP TRIGGER IF EXISTS cleanup_context_on_addon_change ON user_character_addons;

-- Create a new gentle cleanup function that only prevents new context creation
-- but preserves historical context
CREATE OR REPLACE FUNCTION gentle_addon_context_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only run if addon settings actually changed
  IF OLD.addon_settings IS DISTINCT FROM NEW.addon_settings THEN
    -- Log the change for debugging
    RAISE NOTICE 'Addon settings changed for user % character %', NEW.user_id, NEW.character_id;
    
    -- Clean up only CURRENT context for disabled addons, preserve historical context
    -- This allows historical context to remain visible while preventing new context creation
    DELETE FROM user_chat_context 
    WHERE user_id = NEW.user_id
      AND character_id = NEW.character_id
      AND current_context IS NOT NULL
      AND NOT (
        (context_type = 'mood' AND (NEW.addon_settings->>'moodTracking')::boolean = true) OR
        (context_type = 'clothing' AND (NEW.addon_settings->>'clothingInventory')::boolean = true) OR
        (context_type = 'location' AND (NEW.addon_settings->>'locationTracking')::boolean = true) OR
        (context_type = 'time_weather' AND (NEW.addon_settings->>'timeAndWeather')::boolean = true) OR
        (context_type = 'relationship' AND (NEW.addon_settings->>'relationshipStatus')::boolean = true)
      );
      
    -- Clean up only future message context updates for disabled addons
    -- Leave historical message context intact
    DELETE FROM message_context 
    WHERE user_id = NEW.user_id
      AND character_id = NEW.character_id
      AND created_at > NOW() - INTERVAL '1 hour' -- Only very recent context
      AND NOT (
        (context_updates ? 'moodTracking' AND (NEW.addon_settings->>'moodTracking')::boolean = true) OR
        (context_updates ? 'clothingInventory' AND (NEW.addon_settings->>'clothingInventory')::boolean = true) OR
        (context_updates ? 'locationTracking' AND (NEW.addon_settings->>'locationTracking')::boolean = true) OR
        (context_updates ? 'timeAndWeather' AND (NEW.addon_settings->>'timeAndWeather')::boolean = true) OR
        (context_updates ? 'relationshipStatus' AND (NEW.addon_settings->>'relationshipStatus')::boolean = true)
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the new gentle trigger
CREATE TRIGGER gentle_addon_context_cleanup_trigger
  AFTER UPDATE ON user_character_addons
  FOR EACH ROW
  EXECUTE FUNCTION gentle_addon_context_cleanup();

-- Phase 3: Update the general cleanup function to be less aggressive
CREATE OR REPLACE FUNCTION cleanup_disabled_addon_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only remove current context for disabled addons, preserve historical message context
  DELETE FROM user_chat_context 
  WHERE 
    NOT EXISTS (
      SELECT 1 FROM user_character_addons uca
      WHERE uca.user_id = user_chat_context.user_id
        AND uca.character_id = user_chat_context.character_id
        AND (
          (user_chat_context.context_type = 'mood' AND (uca.addon_settings->>'moodTracking')::boolean = true) OR
          (user_chat_context.context_type = 'clothing' AND (uca.addon_settings->>'clothingInventory')::boolean = true) OR
          (user_chat_context.context_type = 'location' AND (uca.addon_settings->>'locationTracking')::boolean = true) OR
          (user_chat_context.context_type = 'time_weather' AND (uca.addon_settings->>'timeAndWeather')::boolean = true) OR
          (user_chat_context.context_type = 'relationship' AND (uca.addon_settings->>'relationshipStatus')::boolean = true)
        )
    );
    
  -- Don't delete historical message context - it should remain visible
  RAISE NOTICE 'Gentle cleanup completed - historical context preserved';
END;
$$;