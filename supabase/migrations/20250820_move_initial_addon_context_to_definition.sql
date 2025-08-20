-- Migration: Move initial addon context fields to character_definitions
-- Date: 2025-08-20

-- 1. Add new columns to character_definitions (idempotent)
ALTER TABLE public.character_definitions
  ADD COLUMN IF NOT EXISTS initial_addon_context_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.character_definitions
  ADD COLUMN IF NOT EXISTS initial_addon_context jsonb;

-- 2. Remove mistakenly added columns from characters table (if they exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='characters' AND column_name='initial_addon_context_enabled'
  ) THEN
    ALTER TABLE public.characters DROP COLUMN initial_addon_context_enabled;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='characters' AND column_name='initial_addon_context'
  ) THEN
    ALTER TABLE public.characters DROP COLUMN initial_addon_context;
  END IF;
END$$;

-- 3. Backfill from personality_summary JSON if present
UPDATE public.character_definitions cd
SET 
  initial_addon_context_enabled = COALESCE(((cd.personality_summary::jsonb)->>'initial_addon_context_enabled')::boolean, cd.initial_addon_context_enabled),
  initial_addon_context = COALESCE((cd.personality_summary::jsonb)->'initial_addon_context', cd.initial_addon_context)
WHERE (cd.personality_summary::jsonb ? 'initial_addon_context_enabled')
   OR (cd.personality_summary::jsonb ? 'initial_addon_context');

-- (Optional) We keep the JSON keys inside personality_summary for backward compatibility.
-- Future cleanup could strip them once all code paths rely on dedicated columns.

COMMENT ON COLUMN public.character_definitions.initial_addon_context_enabled IS 'Flag indicating custom initial addon context is enabled for this character';
COMMENT ON COLUMN public.character_definitions.initial_addon_context IS 'JSON object containing manually seeded initial addon context values (mood, clothing, etc)';
