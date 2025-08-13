-- Phase 2: Query optimization for memory fetching

-- Prioritize updated_at for non-auto rows per character/user
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_character_memories_nonauto_user_char_updated
    ON public.character_memories (user_id, character_id, is_auto_summary, updated_at DESC);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_character_memories_nonauto_user_char_updated skipped: %', SQLERRM;
END $$;

-- Fast fetch of recent auto summaries per chat
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_character_memories_auto_chat_created
    ON public.character_memories (chat_id, is_auto_summary, created_at DESC);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_character_memories_auto_chat_created skipped: %', SQLERRM;
END $$;
