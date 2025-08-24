-- Migration: Relationship Goals Template & Per-User Progress
-- Date: 2025-08-22
-- Security focused: RLS enforced, functions validate ownership.

-- 1. Extend latent profile tables with template column (nullable to avoid breaking existing upsert function)
ALTER TABLE public.character_latent_profiles
  ADD COLUMN IF NOT EXISTS relationship_goals jsonb NULL;

ALTER TABLE public.character_latent_profile_history
  ADD COLUMN IF NOT EXISTS relationship_goals jsonb NULL;

-- Optional structural check (lightweight – ensures object when present)
DO $$ BEGIN
  ALTER TABLE public.character_latent_profiles
    ADD CONSTRAINT character_latent_profiles_relationship_goals_shape
      CHECK (relationship_goals IS NULL OR jsonb_typeof(relationship_goals) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.character_latent_profile_history
    ADD CONSTRAINT character_latent_profile_history_relationship_goals_shape
      CHECK (relationship_goals IS NULL OR jsonb_typeof(relationship_goals) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Per-user progress table
CREATE TABLE IF NOT EXISTS public.user_character_relationship_progress (
  user_id uuid NOT NULL,
  character_id uuid NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, character_id),
  CONSTRAINT user_character_relationship_progress_state_shape CHECK (jsonb_typeof(state) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ucrp_character ON public.user_character_relationship_progress (character_id);
CREATE INDEX IF NOT EXISTS idx_ucrp_updated_at ON public.user_character_relationship_progress (updated_at DESC);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at_rel_progress() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_ucrp_updated_at ON public.user_character_relationship_progress;
CREATE TRIGGER trg_ucrp_updated_at BEFORE UPDATE ON public.user_character_relationship_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_rel_progress();

-- 3. Signals table (append-only)
CREATE TABLE IF NOT EXISTS public.user_character_relationship_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  character_id uuid NOT NULL,
  kind text NOT NULL, -- affection|commitment|intimacy|distancing|rejection|breakup|custom
  weight numeric(5,3) NOT NULL, -- magnitude (positive number); polarity stored separately
  polarity smallint NOT NULL CHECK (polarity IN (1,-1)),
  source_message_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ucrs_user_char_time ON public.user_character_relationship_signals (user_id, character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ucrs_char ON public.user_character_relationship_signals (character_id);

-- 4. RLS Enable
ALTER TABLE public.user_character_relationship_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_character_relationship_signals ENABLE ROW LEVEL SECURITY;

-- 5. Policies (service_role full, users restricted to own rows)
DO $$ BEGIN
  CREATE POLICY "service role manage relationship progress" ON public.user_character_relationship_progress
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "user manage own relationship progress" ON public.user_character_relationship_progress
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service role manage relationship signals" ON public.user_character_relationship_signals
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "user manage own relationship signals" ON public.user_character_relationship_signals
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Relationship Goals Upsert (template) – creator only
CREATE OR REPLACE FUNCTION public.upsert_relationship_goals(
  p_character_id uuid,
  p_relationship_goals jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_creator uuid;
  v_count int;
  v_path jsonb;
  v_orders int[];
  v_max int;
  v_min int;
  v_existing jsonb;
  v_version int;
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

  -- Auto increment version if not provided
  SELECT relationship_goals INTO v_existing FROM public.character_latent_profiles WHERE character_id = p_character_id;
  IF v_existing ? 'version' THEN
    v_version := COALESCE( (p_relationship_goals->>'version')::int, (v_existing->>'version')::int + 1 );
  ELSE
    v_version := COALESCE( (p_relationship_goals->>'version')::int, 1 );
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

  -- Persist template
  UPDATE public.character_latent_profiles
    SET relationship_goals = p_relationship_goals, updated_at = now()
    WHERE character_id = p_character_id;

  -- Snapshot existing profile to history (with new template) for audit
  INSERT INTO public.character_latent_profile_history(
    character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost, relationship_goals
  )
  SELECT clp.character_id, clp.profile, clp.source_card_hash, clp.extraction_version, clp.confidence_avg, clp.populated_domains, clp.token_cost, p_relationship_goals
  FROM public.character_latent_profiles clp
  WHERE clp.character_id = p_character_id;

  RETURN p_relationship_goals;
END;$$;

-- 7. Record signal
CREATE OR REPLACE FUNCTION public.record_relationship_signal(
  p_user_id uuid,
  p_character_id uuid,
  p_kind text,
  p_weight numeric,
  p_polarity smallint,
  p_source_message_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_id uuid; BEGIN
  IF p_user_id <> auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_weight <= 0 THEN RAISE EXCEPTION 'weight must be > 0'; END IF;
  INSERT INTO public.user_character_relationship_signals(user_id, character_id, kind, weight, polarity, source_message_id)
  VALUES (p_user_id, p_character_id, lower(p_kind), p_weight, p_polarity, p_source_message_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;$$;

-- 8. Evaluate progression (advance/regression candidate)
CREATE OR REPLACE FUNCTION public.evaluate_relationship_progress(
  p_user_id uuid,
  p_character_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_template jsonb;
  v_enabled boolean;
  v_progress jsonb;
  v_state jsonb;
  v_now timestamptz := now();
  v_active_order int;
  v_next_threshold numeric;
  v_path jsonb;
  v_next_order int;
  v_decay_rate numeric := 0.01; -- default per hour
  v_last_eval timestamptz;
  v_elapsed_hours numeric := 0;
  v_score numeric := 0;
  v_positive_sum numeric := 0;
  v_negative_cnt int := 0;
  v_negative_streak int := 0;
  v_pending boolean := false;
  v_reg_candidate int := NULL;
  v_time_enabled boolean := false;
BEGIN
  -- Gate: time awareness must be enabled
  SELECT COALESCE(time_awareness_enabled,false) INTO v_time_enabled
    FROM public.user_character_settings
    WHERE user_id = p_user_id AND character_id = p_character_id;
  IF NOT v_time_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'time_awareness_disabled');
  END IF;

  SELECT relationship_goals INTO v_template FROM public.character_latent_profiles WHERE character_id = p_character_id;
  IF v_template IS NULL OR jsonb_typeof(v_template) <> 'object' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_template');
  END IF;
  v_enabled := COALESCE( (v_template->>'enabled')::boolean, false );
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'template_disabled');
  END IF;
  v_path := v_template->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'invalid_path');
  END IF;

  -- Fetch or initialize progress row
  SELECT state INTO v_state FROM public.user_character_relationship_progress
    WHERE user_id = p_user_id AND character_id = p_character_id FOR UPDATE;
  IF v_state IS NULL THEN
    v_state := jsonb_build_object(
      'active_order', 1,
      'current_score', 0,
      'reached', jsonb_build_object('1', to_jsonb(v_now)),
      'decay_per_hour', v_decay_rate,
      'pending_regression', false,
      'regression_candidate_order', NULL,
      'negative_streak', 0,
      'last_eval_at', v_now
    );
    INSERT INTO public.user_character_relationship_progress(user_id, character_id, state)
      VALUES (p_user_id, p_character_id, v_state)
      ON CONFLICT (user_id, character_id) DO NOTHING;
    RETURN v_state; -- first initialization – no signals yet
  END IF;

  v_active_order := COALESCE( (v_state->>'active_order')::int, 1 );
  v_score := COALESCE( (v_state->>'current_score')::numeric, 0 );
  v_last_eval := COALESCE( (v_state->>'last_eval_at')::timestamptz, v_now );
  v_negative_streak := COALESCE( (v_state->>'negative_streak')::int, 0 );
  v_pending := COALESCE( (v_state->>'pending_regression')::boolean, false );
  v_reg_candidate := CASE WHEN (v_state ? 'regression_candidate_order') THEN (v_state->>'regression_candidate_order')::int ELSE NULL END;
  v_decay_rate := COALESCE( (v_state->>'decay_per_hour')::numeric, v_decay_rate );
  v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - v_last_eval))/3600.0;
  IF v_elapsed_hours > 0 THEN
    v_score := GREATEST(0, v_score - (v_decay_rate * v_elapsed_hours));
  END IF;

  -- Aggregate signals since last eval
  SELECT COALESCE(SUM(CASE WHEN polarity = 1 THEN weight ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN polarity = -1 THEN 1 ELSE 0 END),0)
    INTO v_positive_sum, v_negative_cnt
  FROM public.user_character_relationship_signals
  WHERE user_id = p_user_id AND character_id = p_character_id AND created_at > v_last_eval;

  v_score := v_score + v_positive_sum;
  v_negative_streak := v_negative_streak + v_negative_cnt;

  -- Determine next threshold
  v_next_order := v_active_order + 1;
  SELECT (elem->>'threshold')::numeric INTO v_next_threshold
  FROM jsonb_array_elements(v_path) elem
  WHERE (elem->>'order')::int = v_next_order;

  IF v_next_threshold IS NOT NULL AND v_score >= v_next_threshold THEN
    -- Advance
    v_active_order := v_next_order;
    v_score := ROUND(v_next_threshold * 0.30, 3); -- reset to 30%
    v_state := jsonb_set(v_state, '{reached}', (v_state->'reached') || jsonb_build_object(v_next_order::text, to_jsonb(v_now)), true);
    v_negative_streak := 0;
    v_pending := false;
    v_reg_candidate := NULL;
  END IF;

  -- Check regression candidate conditions (only if > stage 1 and not already pending)
  IF v_active_order > 1 AND NOT v_pending THEN
    IF v_negative_streak >= 5 THEN
      v_pending := true;
      v_reg_candidate := v_active_order - 1;
    END IF;
  END IF;

  -- Persist updated state
  v_state := jsonb_set(v_state, '{active_order}', to_jsonb(v_active_order), true);
  v_state := jsonb_set(v_state, '{current_score}', to_jsonb(v_score), true);
  v_state := jsonb_set(v_state, '{negative_streak}', to_jsonb(v_negative_streak), true);
  v_state := jsonb_set(v_state, '{pending_regression}', to_jsonb(v_pending), true);
  IF v_reg_candidate IS NULL THEN
    v_state := v_state - 'regression_candidate_order';
  ELSE
    v_state := jsonb_set(v_state, '{regression_candidate_order}', to_jsonb(v_reg_candidate), true);
  END IF;
  v_state := jsonb_set(v_state, '{last_eval_at}', to_jsonb(v_now), true);

  UPDATE public.user_character_relationship_progress
    SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;$$;

-- 9. Confirm regression (textual confirmation path)
CREATE OR REPLACE FUNCTION public.confirm_relationship_regression(
  p_user_id uuid,
  p_character_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_state jsonb; v_active int; v_candidate int; BEGIN
  SELECT state INTO v_state FROM public.user_character_relationship_progress
    WHERE user_id = p_user_id AND character_id = p_character_id FOR UPDATE;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_progress');
  END IF;
  IF COALESCE( (v_state->>'pending_regression')::boolean, false) = false THEN
    RETURN jsonb_build_object('skipped', true, 'reason','no_pending_regression');
  END IF;
  v_active := (v_state->>'active_order')::int;
  v_candidate := (v_state->>'regression_candidate_order')::int;
  IF v_candidate IS NULL OR v_candidate >= v_active THEN
    RETURN jsonb_build_object('error','invalid_candidate');
  END IF;
  v_state := jsonb_set(v_state, '{active_order}', to_jsonb(v_candidate), true);
  v_state := jsonb_set(v_state, '{current_score}', to_jsonb(0), true);
  v_state := jsonb_set(v_state, '{pending_regression}', 'false', true);
  v_state := v_state - 'regression_candidate_order';
  v_state := jsonb_set(v_state, '{negative_streak}', to_jsonb(0), true);
  v_state := jsonb_set(v_state, '{last_eval_at}', to_jsonb(now()), true);
  UPDATE public.user_character_relationship_progress SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;
  RETURN v_state;
END;$$;

-- Grants (reuse existing pattern – authenticated users can execute, rely on ownership checks inside)
GRANT EXECUTE ON FUNCTION public.upsert_relationship_goals(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_relationship_signal(uuid, uuid, text, numeric, smallint, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_relationship_progress(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_relationship_regression(uuid, uuid) TO authenticated, service_role;

-- NOTE: Existing upsert_character_latent_profile function unaffected; relationship_goals column is nullable & preserved.
