-- Add was_public flag to characters and enforce delete constraints + RPC for deletion
BEGIN;

-- 1) Add was_public column to characters
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS was_public boolean NOT NULL DEFAULT false;

-- Backfill current state: any currently public character has was_public=true
UPDATE public.characters
SET was_public = true
WHERE visibility = 'public' AND was_public = false;

-- 2) Trigger to keep was_public sticky once character has been public
CREATE OR REPLACE FUNCTION public.set_was_public_on_visibility_change()
RETURNS trigger AS $$
BEGIN
  -- If ever set to public, keep was_public true forever
  IF NEW.visibility = 'public' THEN
    NEW.was_public := true;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.was_public, false) = true THEN
    NEW.was_public := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_set_was_public ON public.characters;
CREATE TRIGGER tr_set_was_public
BEFORE INSERT OR UPDATE ON public.characters
FOR EACH ROW EXECUTE FUNCTION public.set_was_public_on_visibility_change();

-- 3) Tighten delete RLS: allow delete only for owner AND never-public AND not currently public
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'characters' AND policyname = 'Users can delete own characters'
  ) THEN
    DROP POLICY "Users can delete own characters" ON public.characters;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'characters'
      AND policyname = 'Users can delete private never-public characters they own'
  ) THEN
    CREATE POLICY "Users can delete private never-public characters they own" ON public.characters
      FOR DELETE USING (
        auth.uid() = creator_id
        AND was_public = false
        AND visibility <> 'public'
      );
  END IF;
END $$;

-- 4) RPC to delete a private, never-public character and all user-related chat data
CREATE OR REPLACE FUNCTION public.delete_private_character(p_character_id uuid)
RETURNS void AS $$
DECLARE
  v_creator uuid;
  v_was_public boolean;
  v_visibility text;
  v_chat_id uuid;
BEGIN
  -- Fetch character ownership and visibility flags
  SELECT creator_id, was_public, visibility
  INTO v_creator, v_was_public, v_visibility
  FROM public.characters
  WHERE id = p_character_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  IF v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_was_public THEN
    RAISE EXCEPTION 'Characters that have been public cannot be deleted';
  END IF;

  IF v_visibility = 'public' THEN
    RAISE EXCEPTION 'Public characters cannot be deleted';
  END IF;

  -- Clean up per-user context tied to this character
  -- 1) user_chat_context rows for this user & character (if table exists)
  BEGIN
    DELETE FROM public.user_chat_context
    WHERE user_id = auth.uid() AND character_id = p_character_id;
  EXCEPTION WHEN undefined_table THEN
    -- ignore if table doesn't exist in this environment
    NULL;
  END;

  -- 2) character_memories for this user & character (if table exists)
  BEGIN
    DELETE FROM public.character_memories
    WHERE user_id = auth.uid() AND character_id = p_character_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- 3) Delete all chats for this user & character using existing helper (if exists)
  FOR v_chat_id IN
    SELECT id FROM public.chats WHERE user_id = auth.uid() AND character_id = p_character_id
  LOOP
    BEGIN
      PERFORM public.delete_chat_complete(v_chat_id, auth.uid());
    EXCEPTION WHEN undefined_function THEN
      -- Fallback: direct delete with cascades
      DELETE FROM public.chats WHERE id = v_chat_id AND user_id = auth.uid();
    END;
  END LOOP;

  -- 4) Finally delete the character (will cascade to definitions, tags, likes, favorites, etc.)
  DELETE FROM public.characters
  WHERE id = p_character_id AND creator_id = auth.uid() AND was_public = false AND visibility <> 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character delete failed due to constraints';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_private_character(uuid) TO authenticated;

COMMIT;
