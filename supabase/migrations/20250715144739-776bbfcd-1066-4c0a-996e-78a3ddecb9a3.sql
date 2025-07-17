-- Fix Phase 1: Replace context deletion trigger with context prevention trigger
-- This ensures historical context is NEVER deleted, only new context creation is prevented

-- Drop the current trigger that deletes historical data
DROP TRIGGER IF EXISTS gentle_addon_context_cleanup_trigger ON user_character_addons;

-- Create a new function that only prevents new context creation, preserves ALL historical data
CREATE OR REPLACE FUNCTION prevent_new_context_for_disabled_addons()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- This trigger is informational only - it doesn't delete any data
  -- The actual prevention of new context creation happens in the chat edge function
  -- This ensures historical context is NEVER deleted
  
  IF OLD.addon_settings IS DISTINCT FROM NEW.addon_settings THEN
    RAISE NOTICE 'Addon settings changed for user % character % - historical context preserved', NEW.user_id, NEW.character_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the new trigger that only logs changes, doesn't delete data
CREATE TRIGGER prevent_new_context_for_disabled_addons_trigger
  AFTER UPDATE ON user_character_addons
  FOR EACH ROW
  EXECUTE FUNCTION prevent_new_context_for_disabled_addons();

-- Update the cleanup function to preserve ALL historical data
CREATE OR REPLACE FUNCTION cleanup_disabled_addon_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- This function now only cleans up current context state, never historical data
  -- Only remove current active context for disabled addons
  DELETE FROM user_chat_context 
  WHERE current_context IS NOT NULL
    AND NOT EXISTS (
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
    
  -- NEVER delete historical message context - it must be preserved for historical accuracy
  RAISE NOTICE 'Cleanup completed - ALL historical context preserved, only current context cleaned';
END;
$$;