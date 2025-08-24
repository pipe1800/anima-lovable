-- Add latent character profile storage (internal, non-user-visible)
-- This schema stores the compact implicit trait profile extracted from a character card.
-- Access is restricted to the service role only (no RLS policies for anon/authenticated).

-- 1. Main table for current active latent profile per character
CREATE TABLE IF NOT EXISTS public.character_latent_profiles (
  character_id uuid PRIMARY KEY REFERENCES public.characters(id) ON DELETE CASCADE,
  profile jsonb NOT NULL,                          -- validated compact latent JSON
  source_card_hash text NOT NULL,                  -- sha256 of canonical character card inputs
  extraction_version text NOT NULL,                -- version of extraction schema/prompt
  confidence_avg numeric(4,3),                     -- 0-1 average confidence (rounded client-side)
  populated_domains smallint NOT NULL CHECK (populated_domains BETWEEN 0 AND 20),
  token_cost integer,                              -- optional: tokens spent on last extraction
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_latent_profiles_profile_shape CHECK (jsonb_typeof(profile) = 'object')
);

-- 2. History table (append-only) for auditing / re-generation comparisons
CREATE TABLE IF NOT EXISTS public.character_latent_profile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  profile jsonb NOT NULL,
  source_card_hash text NOT NULL,
  extraction_version text NOT NULL,
  confidence_avg numeric(4,3),
  populated_domains smallint NOT NULL CHECK (populated_domains BETWEEN 0 AND 20),
  token_cost integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_latent_profile_history_profile_shape CHECK (jsonb_typeof(profile) = 'object')
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_character_latent_profiles_hash ON public.character_latent_profiles(source_card_hash);
CREATE INDEX IF NOT EXISTS idx_character_latent_profile_history_char ON public.character_latent_profile_history(character_id);
CREATE INDEX IF NOT EXISTS idx_character_latent_profile_history_hash ON public.character_latent_profile_history(source_card_hash);

-- 4. Updated_at trigger for main table
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_character_latent_profiles_updated_at ON public.character_latent_profiles;
CREATE TRIGGER trg_character_latent_profiles_updated_at
BEFORE UPDATE ON public.character_latent_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Enable RLS and lock down (service_role only)
ALTER TABLE public.character_latent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_latent_profile_history ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated users. Only service_role (via auth.role()).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'character_latent_profiles' AND policyname = 'service role manage latent profiles'
  ) THEN
    CREATE POLICY "service role manage latent profiles" ON public.character_latent_profiles
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'character_latent_profile_history' AND policyname = 'service role insert history'
  ) THEN
    CREATE POLICY "service role insert history" ON public.character_latent_profile_history
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'character_latent_profile_history' AND policyname = 'service role select history'
  ) THEN
    CREATE POLICY "service role select history" ON public.character_latent_profile_history
      FOR SELECT USING (auth.role() = 'service_role');
  END IF;
END$$;

-- 6. Optional helper function (service-side) to upsert current profile & log history
CREATE OR REPLACE FUNCTION public.upsert_character_latent_profile(
  p_character_id uuid,
  p_profile jsonb,
  p_source_card_hash text,
  p_extraction_version text,
  p_confidence_avg numeric,
  p_populated_domains smallint,
  p_token_cost integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert history first (append-only)
  INSERT INTO public.character_latent_profile_history(
    character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost
  ) VALUES (
    p_character_id, p_profile, p_source_card_hash, p_extraction_version, p_confidence_avg, p_populated_domains, p_token_cost
  );

  -- Upsert current state
  INSERT INTO public.character_latent_profiles AS clp(
    character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost
  ) VALUES (
    p_character_id, p_profile, p_source_card_hash, p_extraction_version, p_confidence_avg, p_populated_domains, p_token_cost
  )
  ON CONFLICT (character_id) DO UPDATE SET
    profile = EXCLUDED.profile,
    source_card_hash = EXCLUDED.source_card_hash,
    extraction_version = EXCLUDED.extraction_version,
    confidence_avg = EXCLUDED.confidence_avg,
    populated_domains = EXCLUDED.populated_domains,
    token_cost = EXCLUDED.token_cost,
    updated_at = now();
END;$$;

-- Restrict function execution to service role only
REVOKE ALL ON FUNCTION public.upsert_character_latent_profile(uuid, jsonb, text, text, numeric, smallint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_character_latent_profile(uuid, jsonb, text, text, numeric, smallint, integer) TO service_role;

-- NOTE: Do NOT grant to authenticated/anon roles to keep latent traits hidden from users.
