-- Ensure world_info_entries.keywords and character_memories.trigger_keywords are text[]
DO $$ BEGIN
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'world_info_entries' AND column_name = 'keywords'
     AND udt_name = 'text[]';
  IF NOT FOUND THEN
    ALTER TABLE public.world_info_entries
      ALTER COLUMN keywords TYPE text[] USING keywords::text[];
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'world_info_entries.keywords alter skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'character_memories' AND column_name = 'trigger_keywords'
     AND udt_name = 'text[]';
  IF NOT FOUND THEN
    ALTER TABLE public.character_memories
      ALTER COLUMN trigger_keywords TYPE text[] USING trigger_keywords::text[];
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'character_memories.trigger_keywords alter skipped: %', SQLERRM;
END $$;
