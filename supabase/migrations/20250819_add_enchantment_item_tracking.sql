-- Add enchantment & item inventory tracking columns
-- Depends on existing user_global_chat_settings and chat_context tables

BEGIN;

-- 1. user_global_chat_settings new boolean flags (default false)
ALTER TABLE public.user_global_chat_settings
  ADD COLUMN IF NOT EXISTS enchantment_status boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS item_inventory boolean DEFAULT false;

-- 2. chat_context.current_context JSONB will start storing new keys; optional backfill for existing rows
-- Add generated / virtual columns if you previously had separate columns (here we keep JSONB only)
-- For analytics convenience, add projection columns nullable text
ALTER TABLE public.chat_context
  ADD COLUMN IF NOT EXISTS enchantment_status text,
  ADD COLUMN IF NOT EXISTS item_inventory text;

-- 3. Backfill projection columns from existing JSON if keys exist
UPDATE public.chat_context
SET enchantment_status = (current_context->>'enchantment_status'),
    item_inventory = (current_context->>'item_inventory')
WHERE (current_context ? 'enchantment_status') OR (current_context ? 'item_inventory');

-- 4. Ensure RLS policies (no change required if using permissive existing policies)
-- (Add policy adjustments here if needed.)

COMMIT;

-- Rollback snippet (manual):
-- ALTER TABLE public.user_global_chat_settings DROP COLUMN enchantment_status, DROP COLUMN item_inventory;
-- ALTER TABLE public.chat_context DROP COLUMN enchantment_status, DROP COLUMN item_inventory;

-- Add columns for custom initial addon context on characters table
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS custom_initial_addons_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_initial_addons_context jsonb;

-- Optional: backfill from existing personality_summary if stored there previously
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT c.id, cd.personality_summary
           FROM public.characters c
           JOIN public.character_definitions cd ON cd.character_id = c.id
           WHERE c.custom_initial_addons_enabled = false LOOP
    BEGIN
      IF r.personality_summary IS NOT NULL THEN
        PERFORM 1;
        BEGIN
          -- Attempt parse
          IF jsonb_typeof(r.personality_summary::jsonb) = 'object' THEN
            IF (r.personality_summary::jsonb ? 'initial_addon_context_enabled') THEN
              UPDATE public.characters
              SET custom_initial_addons_enabled = COALESCE( (r.personality_summary::jsonb ->> 'initial_addon_context_enabled')::boolean, false ),
                  custom_initial_addons_context = (r.personality_summary::jsonb -> 'initial_addon_context')
              WHERE id = r.id;
            END IF;
          END IF;
        EXCEPTION WHEN others THEN
          -- swallow parse errors
          NULL;
        END;
      END IF;
    END;
  END LOOP;
END $$;
