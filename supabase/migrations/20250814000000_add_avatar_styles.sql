-- Add new avatar style settings to user_global_chat_settings table
-- Migration: Add advanced avatar style options
-- Date: 2025-08-13

-- Add new columns for avatar styling
ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS avatar_style text NOT NULL DEFAULT 'classic' CHECK (avatar_style = ANY (ARRAY['classic'::text, 'bubble-bg'::text, 'portrait'::text, 'side-banner'::text]));

-- Avatar-as-Bubble Background settings
ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS avatar_overlay_opacity numeric DEFAULT 0.6 CHECK (avatar_overlay_opacity >= 0 AND avatar_overlay_opacity <= 1);

ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS avatar_overlay_color text DEFAULT '#000000';

ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS avatar_blur_nsfw boolean DEFAULT true;

-- Portrait style settings
ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS portrait_frame_style text DEFAULT 'clean' CHECK (portrait_frame_style = ANY (ARRAY['clean'::text, 'polaroid'::text, 'foil'::text]));

ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS portrait_frame_color text DEFAULT '#4B5563';

-- Side Banner settings
ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS banner_width text DEFAULT 'md' CHECK (banner_width = ANY (ARRAY['sm'::text, 'md'::text, 'lg'::text]));

ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS banner_tint_from_avatar boolean DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.user_global_chat_settings.avatar_style IS 'Avatar display style: classic (normal), bubble-bg (avatar as bubble background), portrait (framed), side-banner (vertical strip)';
