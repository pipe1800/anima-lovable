-- Database cleanup: Remove timeWeather duplicates and standardize to timeAndWeather
-- This migration fixes the inconsistent field naming that's causing the duplicate addons issue

-- Step 1: Update all addon_settings records to use timeAndWeather instead of timeWeather
UPDATE user_character_addons 
SET addon_settings = addon_settings - 'timeWeather' || 
    jsonb_build_object('timeAndWeather', COALESCE((addon_settings->>'timeWeather')::boolean, false))
WHERE addon_settings ? 'timeWeather';

-- Step 2: Clean up any context entries that might reference the old field name
-- This ensures context consistency across the system
DELETE FROM user_chat_context 
WHERE context_type = 'timeWeather' OR context_type = 'time_weather_old';

-- Step 3: Ensure we only have the correct context_type for time and weather
UPDATE user_chat_context 
SET context_type = 'time_weather' 
WHERE context_type = 'timeWeather' OR context_type = 'timeAndWeather_context';

-- Step 4: Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: timeWeather field standardized to timeAndWeather';
    RAISE NOTICE 'Updated addon_settings to use timeAndWeather consistently';
    RAISE NOTICE 'Cleaned up context entries for consistency';
END $$;