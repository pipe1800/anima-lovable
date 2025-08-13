-- Remove holographic badge columns from user_global_chat_settings table
-- Migration: Remove unused holographic badge settings
-- Date: 2025-08-13

-- Drop holographic badge related columns
ALTER TABLE public.user_global_chat_settings
  DROP COLUMN IF EXISTS holo_badge_shape;

ALTER TABLE public.user_global_chat_settings
  DROP COLUMN IF EXISTS holo_ring_style;

ALTER TABLE public.user_global_chat_settings
  DROP COLUMN IF EXISTS holo_animation_intensity;

-- Update avatar_style constraint to remove holo-badge option
ALTER TABLE public.user_global_chat_settings
  DROP CONSTRAINT IF EXISTS user_global_chat_settings_avatar_style_check;

ALTER TABLE public.user_global_chat_settings
  ADD CONSTRAINT user_global_chat_settings_avatar_style_check 
  CHECK (avatar_style = ANY (ARRAY['classic'::text, 'bubble-bg'::text, 'portrait'::text, 'side-banner'::text]));

-- Update any existing holo-badge values to classic
UPDATE public.user_global_chat_settings 
SET avatar_style = 'classic' 
WHERE avatar_style = 'holo-badge';

-- Add comment
COMMENT ON COLUMN public.user_global_chat_settings.avatar_style IS 'Avatar display style: classic (normal), bubble-bg (avatar as bubble background), portrait (framed), side-banner (vertical strip)';
