-- Migration: Update upsert_relationship_goals to insert latent profile row if missing
-- Ensures relationship_goals persist even before latent extraction runs.

CREATE OR REPLACE FUNCTION public.upsert_relationship_goals(
  p_character_id uuid,
  p_relationship_goals jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_count int;
  v_path jsonb;
  v_orders int[];
  v_max int;
  v_min int;
  v_existing jsonb;       -- existing relationship_goals (may be null)
  v_version int;
  v_rowcount int;
BEGIN
  IF p_relationship_goals IS NULL THEN
    RAISE EXCEPTION 'relationship_goals payload required';
  END IF;

  SELECT creator_id INTO v_creator FROM public.characters WHERE id = p_character_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'character not found';
  END IF;
  IF v_creator <> auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_path := p_relationship_goals->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RAISE EXCEPTION 'path must be array';
  END IF;
  v_count := jsonb_array_length(v_path);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'at least 2 goals required';
  END IF;
  IF v_count > 10 THEN
    RAISE EXCEPTION 'max 10 goals exceeded';
  END IF;

  SELECT array_agg((elem->>'order')::int ORDER BY (elem->>'order')::int)
    INTO v_orders
  FROM jsonb_array_elements(v_path) elem;

  v_max := (SELECT max(o) FROM unnest(v_orders) o);
  v_min := (SELECT min(o) FROM unnest(v_orders) o);
  IF v_min <> 1 OR v_max <> v_count THEN
    RAISE EXCEPTION 'orders must be contiguous starting at 1';
  END IF;

  -- Lock / check for existing latent profile row
  SELECT relationship_goals INTO v_existing
  FROM public.character_latent_profiles
  WHERE character_id = p_character_id
  FOR UPDATE;  -- if present, lock row
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  -- Determine version
  IF v_rowcount = 0 THEN
    -- No latent profile row yet – initial version baseline
    v_version := COALESCE( (p_relationship_goals->>'version')::int, 1 );
  ELSE
    IF v_existing ? 'version' THEN
      v_version := COALESCE( (p_relationship_goals->>'version')::int, (v_existing->>'version')::int + 1 );
    ELSE
      v_version := COALESCE( (p_relationship_goals->>'version')::int, 1 );
    END IF;
  END IF;

  p_relationship_goals := jsonb_set(p_relationship_goals, '{version}', to_jsonb(v_version), true);
  p_relationship_goals := jsonb_set(p_relationship_goals, '{metadata,updated_at}', to_jsonb(now()), true);
  IF NOT (p_relationship_goals ? 'metadata') THEN
    p_relationship_goals := jsonb_set(p_relationship_goals, '{metadata}', jsonb_build_object('created_at', now(), 'updated_at', now()), true);
  ELSE
    IF NOT (p_relationship_goals #> '{metadata,created_at}' IS NOT NULL) THEN
      p_relationship_goals := jsonb_set(p_relationship_goals, '{metadata,created_at}', to_jsonb(now()), true);
    END IF;
  END IF;

  IF v_rowcount = 0 THEN
    -- Insert stub latent profile row with template
    INSERT INTO public.character_latent_profiles(
      character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost, relationship_goals, created_at, updated_at
    ) VALUES (
      p_character_id, '{}'::jsonb, 'rel_goals_only', 'rel_goals_init', NULL, 0, NULL, p_relationship_goals, now(), now()
    );

    -- History snapshot (initial)
    INSERT INTO public.character_latent_profile_history(
      character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost, relationship_goals, created_at
    ) VALUES (
      p_character_id, '{}'::jsonb, 'rel_goals_only', 'rel_goals_init', NULL, 0, NULL, p_relationship_goals, now()
    );

    RETURN p_relationship_goals;
  END IF;

  -- Existing row: update & snapshot
  UPDATE public.character_latent_profiles
    SET relationship_goals = p_relationship_goals,
        updated_at = now()
    WHERE character_id = p_character_id;

  INSERT INTO public.character_latent_profile_history(
    character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost, relationship_goals
  )
  SELECT clp.character_id, clp.profile, clp.source_card_hash, clp.extraction_version, clp.confidence_avg, clp.populated_domains, clp.token_cost, p_relationship_goals
  FROM public.character_latent_profiles clp
  WHERE clp.character_id = p_character_id;

  RETURN p_relationship_goals;
END;$$;

COMMENT ON FUNCTION public.upsert_relationship_goals(uuid, jsonb) IS 'Upserts relationship goals template; inserts latent profile stub if missing.';
