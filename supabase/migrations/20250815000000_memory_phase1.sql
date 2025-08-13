-- Phase 1: Memory correctness and weighting prep
-- 1) Unique index to enforce idempotency of auto-summaries per chat/range
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_summary_range
  ON public.character_memories (user_id, character_id, chat_id, message_count)
  WHERE is_auto_summary = true;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'uq_auto_summary_range creation skipped: %', SQLERRM;
END $$;

-- 2) Supporting indexes for hot read paths
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_character_memories_chat_auto_created
    ON public.character_memories (chat_id, is_auto_summary, created_at DESC);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_character_memories_chat_auto_created creation skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_character_memories_chat_auto_message_count
    ON public.character_memories (chat_id, is_auto_summary, message_count);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_character_memories_chat_auto_message_count creation skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_messages_chat_order
    ON public.messages (chat_id, message_order);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_messages_chat_order creation skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_messages_chat_isai_order
    ON public.messages (chat_id, is_ai_message, message_order);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_messages_chat_isai_order creation skipped: %', SQLERRM;
END $$;

-- 3) Ensure trigger_keywords is text[] (no-op if already correct)
-- Note: context schema showed generic ARRAY. Use USING clause to cast when needed.
DO $$ BEGIN
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'character_memories' AND column_name = 'trigger_keywords'
     AND udt_name = 'text[]';
  IF NOT FOUND THEN
    ALTER TABLE public.character_memories
      ALTER COLUMN trigger_keywords TYPE text[] USING trigger_keywords::text[];
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'trigger_keywords type check/alter skipped: %', SQLERRM;
END $$;

-- Optional columns for future weighting (commented for now)
-- ALTER TABLE public.character_memories ADD COLUMN IF NOT EXISTS last_injected_at timestamptz;
-- ALTER TABLE public.character_memories ADD COLUMN IF NOT EXISTS injection_count integer DEFAULT 0;
-- ALTER TABLE public.character_memories ADD COLUMN IF NOT EXISTS content_hash text;
