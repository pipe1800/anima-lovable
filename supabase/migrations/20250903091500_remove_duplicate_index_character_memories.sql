-- Remove one of the duplicate indexes on public.character_memories (user_id, character_id)
-- Safe/idempotent: drops only if the duplicate exists, keeping a single index.
DO $$
BEGIN
  -- Prefer to keep the first-created index "character_memories_user_character_idx" if present
  IF to_regclass('public.character_memories_user_character_idx') IS NOT NULL
     AND to_regclass('public.idx_character_memories_user_character') IS NOT NULL THEN
    -- Both exist: drop the later/duplicate (name chosen arbitrarily as duplicate)
    EXECUTE 'DROP INDEX public.idx_character_memories_user_character';
  ELSIF to_regclass('public.character_memories_user_character_idx') IS NULL
        AND to_regclass('public.idx_character_memories_user_character') IS NOT NULL THEN
    -- Only the alternative exists: keep one, nothing to drop (or optionally rename)
    -- (Renaming skipped to avoid unexpected dependency issues.)
    NULL;
  END IF;
END;
$$;
