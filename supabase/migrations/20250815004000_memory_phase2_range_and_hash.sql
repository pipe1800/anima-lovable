-- Phase 2: Explicit AI sequence range and stronger de-duplication

-- 1) Add explicit range columns (nullable for backfill)
DO $$ BEGIN
  ALTER TABLE public.character_memories
    ADD COLUMN IF NOT EXISTS ai_sequence_start integer,
    ADD COLUMN IF NOT EXISTS ai_sequence_end integer;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Add ai_sequence_* columns skipped: %', SQLERRM;
END $$;

-- 2) Backfill ai_sequence_* for auto-summaries when possible
--    We assume message_count stores the AI sequence end; start is inferred from previous summary
WITH ordered AS (
  SELECT id, chat_id, user_id, character_id, message_count, created_at,
         ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at ASC) AS rn,
         LAG(message_count) OVER (PARTITION BY chat_id ORDER BY created_at ASC) AS prev_end
    FROM public.character_memories
   WHERE is_auto_summary = true
)
UPDATE public.character_memories cm
   SET ai_sequence_start = COALESCE(o.prev_end, 0) + 1,
       ai_sequence_end   = o.message_count
  FROM ordered o
 WHERE cm.id = o.id
   AND (cm.ai_sequence_start IS NULL OR cm.ai_sequence_end IS NULL);

-- 3) Ensure content_hash is populated and normalized, matching previous migration style
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE public.character_memories
   SET content_hash = encode(digest(regexp_replace(btrim(summary_content), '\\s+', ' ', 'g')::bytea, 'sha256'), 'hex')
 WHERE content_hash IS NULL AND summary_content IS NOT NULL;

-- 4) Unique partial index by explicit range (defensive with WHERE)
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_summary_range_explicit
    ON public.character_memories (chat_id, ai_sequence_end)
    WHERE is_auto_summary = true;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'uq_auto_summary_range_explicit creation skipped: %', SQLERRM;
END $$;
