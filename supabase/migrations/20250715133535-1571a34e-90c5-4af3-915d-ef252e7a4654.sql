-- Phase 1: Fix field name inconsistency in addon settings
-- Update all timeWeather fields to timeAndWeather for consistency
UPDATE user_character_addons 
SET addon_settings = addon_settings - 'timeWeather' || jsonb_build_object('timeAndWeather', (addon_settings->>'timeWeather')::boolean)
WHERE addon_settings ? 'timeWeather';

-- Add index for better performance on addon settings queries
CREATE INDEX IF NOT EXISTS idx_user_character_addons_user_character ON user_character_addons(user_id, character_id);