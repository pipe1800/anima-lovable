-- Enable pgcrypto for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Backfill content_hash for all memories missing it (normalize whitespace)
UPDATE public.character_memories
   SET content_hash = encode(digest(regexp_replace(btrim(summary_content), '\\s+', ' ', 'g')::bytea, 'sha256'), 'hex')
 WHERE content_hash IS NULL
   AND summary_content IS NOT NULL;

-- Deduplicate auto-summaries per chat by identical content_hash
WITH normalized AS (
  SELECT id, chat_id, content_hash, created_at, injection_count, last_injected_at
  FROM public.character_memories
  WHERE is_auto_summary = true AND content_hash IS NOT NULL
),

dups AS (
  SELECT chat_id,
         content_hash,
         (ARRAY_AGG(id ORDER BY created_at ASC))[1] AS keep_id,
         ARRAY_AGG(id ORDER BY created_at ASC) AS all_ids,
         SUM(COALESCE(injection_count,0)) AS total_injections,
         MAX(last_injected_at) AS max_last_injected
  FROM normalized
  GROUP BY chat_id, content_hash
  HAVING COUNT(*) > 1
)
-- Merge counters into keepers
UPDATE public.character_memories cm
   SET injection_count = d.total_injections,
       last_injected_at = GREATEST(cm.last_injected_at, d.max_last_injected)
  FROM dups d
 WHERE cm.id = d.keep_id;

-- Remove duplicate rows, keep the chosen keeper (first in list)
WITH normalized AS (
  SELECT id, chat_id, content_hash, created_at
  FROM public.character_memories
  WHERE is_auto_summary = true AND content_hash IS NOT NULL
),

dups AS (
  SELECT chat_id,
         content_hash,
         ARRAY_AGG(id ORDER BY created_at ASC) AS all_ids
  FROM normalized
  GROUP BY chat_id, content_hash
  HAVING COUNT(*) > 1
)
DELETE FROM public.character_memories c
USING dups d
WHERE c.id = ANY(d.all_ids[2:]);

-- Unique partial index to enforce future de-duplication for auto-summaries per chat
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_summary_content_hash_per_chat
  ON public.character_memories (chat_id, content_hash)
  WHERE is_auto_summary = true;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'uq_auto_summary_content_hash_per_chat creation skipped: %', SQLERRM;
END $$;
