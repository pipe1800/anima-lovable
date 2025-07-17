-- Clean up context data for disabled addons
-- This will ensure only context for enabled addons is kept in the database

-- Create a function to clean up context data based on addon settings
CREATE OR REPLACE FUNCTION cleanup_disabled_addon_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remove context data where the corresponding addon is disabled
  DELETE FROM user_chat_context 
  WHERE 
    -- Check if the addon is disabled for this user-character combination
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
    
  -- Also clean up message-specific context for disabled addons
  DELETE FROM message_context 
  WHERE 
    NOT EXISTS (
      SELECT 1 FROM user_character_addons uca
      WHERE uca.user_id = message_context.user_id
        AND uca.character_id = message_context.character_id
        AND (
          (message_context.context_updates ? 'moodTracking' AND (uca.addon_settings->>'moodTracking')::boolean = true) OR
          (message_context.context_updates ? 'clothingInventory' AND (uca.addon_settings->>'clothingInventory')::boolean = true) OR
          (message_context.context_updates ? 'locationTracking' AND (uca.addon_settings->>'locationTracking')::boolean = true) OR
          (message_context.context_updates ? 'timeAndWeather' AND (uca.addon_settings->>'timeAndWeather')::boolean = true) OR
          (message_context.context_updates ? 'relationshipStatus' AND (uca.addon_settings->>'relationshipStatus')::boolean = true)
        )
    );
END;
$$;

-- Add a trigger to automatically clean up context when addon settings change
CREATE OR REPLACE FUNCTION trigger_cleanup_disabled_addon_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only run cleanup if addon settings actually changed
  IF OLD.addon_settings IS DISTINCT FROM NEW.addon_settings THEN
    -- Clean up context for this specific user-character combination
    DELETE FROM user_chat_context 
    WHERE user_id = NEW.user_id
      AND character_id = NEW.character_id
      AND NOT (
        (context_type = 'mood' AND (NEW.addon_settings->>'moodTracking')::boolean = true) OR
        (context_type = 'clothing' AND (NEW.addon_settings->>'clothingInventory')::boolean = true) OR
        (context_type = 'location' AND (NEW.addon_settings->>'locationTracking')::boolean = true) OR
        (context_type = 'time_weather' AND (NEW.addon_settings->>'timeAndWeather')::boolean = true) OR
        (context_type = 'relationship' AND (NEW.addon_settings->>'relationshipStatus')::boolean = true)
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS cleanup_context_on_addon_change ON user_character_addons;
CREATE TRIGGER cleanup_context_on_addon_change
  AFTER UPDATE ON user_character_addons
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cleanup_disabled_addon_context();

-- Run initial cleanup
SELECT cleanup_disabled_addon_context();