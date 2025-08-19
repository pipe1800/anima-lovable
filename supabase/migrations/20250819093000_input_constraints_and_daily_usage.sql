-- Input size constraints & daily usage quota tracking
-- Adds CHECK constraints for world_info_entries, character_memories
-- and introduces user_daily_usage table for persistent per-day quotas.

BEGIN;

-- 1. Add constraints to world_info_entries (keywords length, keyword size, entry_text length)
DO $$
BEGIN
  -- Trim overlong keywords before adding constraint (prevent failure)
  UPDATE public.world_info_entries
  SET keywords = (
    SELECT array_agg(CASE WHEN length(k) > 40 THEN left(k,40) ELSE k END)
    FROM unnest(keywords) AS k
  )
  WHERE EXISTS (
    SELECT 1 FROM unnest(keywords) k WHERE length(k) > 40
  );
  -- Truncate keyword arrays that exceed max allowed count (12)
  UPDATE public.world_info_entries
  SET keywords = (
    SELECT array_agg(k)
    FROM (
      SELECT k FROM unnest(keywords) WITH ORDINALITY AS t(k, ord)
      ORDER BY ord
      LIMIT 12
    ) sub
  )
  WHERE array_length(keywords,1) > 12;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'world_info_entries table missing, skipping prep update';
END$$;

-- Helper function for per-item length check (idempotent)
CREATE OR REPLACE FUNCTION public.array_all_item_length_lte(arr text[], max_len int)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $FN$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(arr) AS x WHERE length(x) > max_len);
$FN$;

-- Add constraints only if they do not already exist (ADD CONSTRAINT IF NOT EXISTS not supported)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'world_info_entries_keywords_count_chk'
  ) THEN
    ALTER TABLE public.world_info_entries
      ADD CONSTRAINT world_info_entries_keywords_count_chk
        CHECK (array_length(keywords,1) IS NOT NULL AND array_length(keywords,1) <= 12);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'world_info_entries_keywords_item_length_chk'
  ) THEN
    ALTER TABLE public.world_info_entries
      ADD CONSTRAINT world_info_entries_keywords_item_length_chk
        CHECK (array_all_item_length_lte(keywords, 40));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'world_info_entries_entry_text_length_chk'
  ) THEN
    ALTER TABLE public.world_info_entries
      ADD CONSTRAINT world_info_entries_entry_text_length_chk
        CHECK (length(entry_text) <= 6000);
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'world_info_entries table missing when adding constraints';
END$$;

-- 2. Add constraints to character_memories (trigger_keywords length & item size, summary_content length)
DO $$
BEGIN
  -- Some deployments may still have summary_content or trigger_keywords named differently; ignore if missing
  UPDATE public.character_memories
  SET trigger_keywords = (
    SELECT array_agg(CASE WHEN length(k) > 40 THEN left(k,40) ELSE k END)
    FROM unnest(trigger_keywords) AS k
  )
  WHERE EXISTS (
    SELECT 1 FROM unnest(trigger_keywords) k WHERE length(k) > 40
  );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'character_memories table missing, skipping prep update';
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'character_memories_trigger_keywords_count_chk'
  ) THEN
    ALTER TABLE public.character_memories
      ADD CONSTRAINT character_memories_trigger_keywords_count_chk
        CHECK (trigger_keywords IS NULL OR array_length(trigger_keywords,1) <= 15);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'character_memories_trigger_keywords_item_length_chk'
  ) THEN
    ALTER TABLE public.character_memories
      ADD CONSTRAINT character_memories_trigger_keywords_item_length_chk
        CHECK (trigger_keywords IS NULL OR array_all_item_length_lte(trigger_keywords, 40));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'character_memories_summary_length_chk'
  ) THEN
    ALTER TABLE public.character_memories
      ADD CONSTRAINT character_memories_summary_length_chk
        CHECK (summary_content IS NULL OR length(summary_content) <= 7000);
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'character_memories table missing when adding constraints';
END$$;

-- 3. Persistent daily usage tracking (simple counters per user per day)
CREATE TABLE IF NOT EXISTS public.user_daily_usage (
  user_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT (CURRENT_DATE),
  summary_calls integer NOT NULL DEFAULT 0,
  manual_memory_calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, usage_date)
);

ALTER TABLE public.user_daily_usage ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_daily_usage' AND policyname='Users can view own daily usage'
  ) THEN
    CREATE POLICY "Users can view own daily usage" ON public.user_daily_usage
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_daily_usage' AND policyname='Users can manage own daily usage'
  ) THEN
    CREATE POLICY "Users can manage own daily usage" ON public.user_daily_usage
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'user_daily_usage table missing after creation attempt';
END$$;

CREATE OR REPLACE FUNCTION public.user_daily_usage_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_user_daily_usage_touch ON public.user_daily_usage;
CREATE TRIGGER trg_user_daily_usage_touch
  BEFORE UPDATE ON public.user_daily_usage
  FOR EACH ROW EXECUTE PROCEDURE public.user_daily_usage_touch();

COMMIT;
