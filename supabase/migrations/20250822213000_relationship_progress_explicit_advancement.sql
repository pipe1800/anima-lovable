-- Migration: Make relationship stage advancement explicit (no automatic advance on threshold)
-- Date: 2025-08-22
-- Changes:
-- 1. Replace evaluate_relationship_progress to only mark readiness (ready_for_next) instead of auto advancing
-- 2. Add advance_relationship_stage(p_user_id, p_character_id) to promote when user explicitly requests

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
  v_state jsonb;
  v_now timestamptz := now();
  v_active_order int;
  v_next_threshold numeric;
  v_path jsonb;
  v_next_order int;
  v_decay_rate numeric := 0.01; -- per hour when time awareness enabled
  v_last_eval timestamptz;
  v_elapsed_hours numeric := 0;
  v_score numeric := 0;
  v_positive_sum numeric := 0;
  v_negative_cnt int := 0;
  v_negative_streak int := 0;
  v_pending boolean := false;
  v_reg_candidate int := NULL;
  v_time_enabled boolean := false;
  v_ready_for_next boolean := false;
BEGIN
  -- Time awareness flag (for decay gating)
  SELECT COALESCE(time_awareness_enabled,false) INTO v_time_enabled
    FROM public.user_character_settings
    WHERE user_id = p_user_id AND character_id = p_character_id;

  -- Load template
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

  -- Lock current state
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
      'last_eval_at', v_now,
      'ready_for_next', false
    );
    INSERT INTO public.user_character_relationship_progress(user_id, character_id, state)
      VALUES (p_user_id, p_character_id, v_state)
      ON CONFLICT (user_id, character_id) DO NOTHING;
    RETURN v_state;
  END IF;

  -- Extract fields
  v_active_order := COALESCE( (v_state->>'active_order')::int, 1 );
  v_score := COALESCE( (v_state->>'current_score')::numeric, 0 );
  v_last_eval := COALESCE( (v_state->>'last_eval_at')::timestamptz, v_now );
  v_negative_streak := COALESCE( (v_state->>'negative_streak')::int, 0 );
  v_pending := COALESCE( (v_state->>'pending_regression')::boolean, false );
  v_reg_candidate := CASE WHEN (v_state ? 'regression_candidate_order') THEN (v_state->>'regression_candidate_order')::int ELSE NULL END;
  v_decay_rate := COALESCE( (v_state->>'decay_per_hour')::numeric, v_decay_rate );
  v_ready_for_next := COALESCE( (v_state->>'ready_for_next')::boolean, false );
  v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - v_last_eval))/3600.0;

  -- Decay only when enabled
  IF v_time_enabled AND v_elapsed_hours > 0 THEN
    v_score := GREATEST(0, v_score - (v_decay_rate * v_elapsed_hours));
  END IF;

  -- Aggregate new signals since last evaluation
  SELECT COALESCE(SUM(CASE WHEN polarity = 1 THEN weight ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN polarity = -1 THEN 1 ELSE 0 END),0)
    INTO v_positive_sum, v_negative_cnt
  FROM public.user_character_relationship_signals
  WHERE user_id = p_user_id AND character_id = p_character_id AND created_at > v_last_eval;

  v_score := v_score + v_positive_sum;
  v_negative_streak := v_negative_streak + v_negative_cnt;

  -- Determine readiness for next stage (DO NOT ADVANCE AUTOMATICALLY)
  v_next_order := v_active_order + 1;
  SELECT (elem->>'threshold')::numeric INTO v_next_threshold
    FROM jsonb_array_elements(v_path) elem
    WHERE (elem->>'order')::int = v_next_order;

  IF v_next_threshold IS NOT NULL THEN
    v_ready_for_next := (v_score >= v_next_threshold);
  ELSE
    v_ready_for_next := false; -- Last stage
  END IF;

  -- Regression detection (unchanged)
  IF v_active_order > 1 AND NOT v_pending THEN
    IF v_negative_streak >= 5 THEN
      v_pending := true;
      v_reg_candidate := v_active_order - 1;
    END IF;
  END IF;

  -- Persist updated fields
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
  v_state := jsonb_set(v_state, '{ready_for_next}', to_jsonb(v_ready_for_next), true);
  IF v_next_threshold IS NOT NULL THEN
    v_state := jsonb_set(v_state, '{next_threshold}', to_jsonb(v_next_threshold), true);
  ELSE
    v_state := v_state - 'next_threshold';
  END IF;

  UPDATE public.user_character_relationship_progress
    SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;$$;

-- New explicit advancement function
CREATE OR REPLACE FUNCTION public.advance_relationship_stage(
  p_user_id uuid,
  p_character_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_template jsonb;
  v_state jsonb;
  v_now timestamptz := now();
  v_active_order int;
  v_ready boolean;
  v_path jsonb;
  v_next_order int;
  v_next_exists boolean := false;
BEGIN
  -- Load template
  SELECT relationship_goals INTO v_template FROM public.character_latent_profiles WHERE character_id = p_character_id;
  IF v_template IS NULL OR jsonb_typeof(v_template) <> 'object' OR COALESCE((v_template->>'enabled')::boolean,false) = false THEN
    RETURN jsonb_build_object('error','template_missing_or_disabled');
  END IF;
  v_path := v_template->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RETURN jsonb_build_object('error','invalid_path');
  END IF;

  -- Lock state
  SELECT state INTO v_state FROM public.user_character_relationship_progress
    WHERE user_id = p_user_id AND character_id = p_character_id FOR UPDATE;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_state');
  END IF;

  v_active_order := COALESCE( (v_state->>'active_order')::int, 1 );
  v_ready := COALESCE( (v_state->>'ready_for_next')::boolean, false );
  v_next_order := v_active_order + 1;

  -- Check next stage exists
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_path) elem
    WHERE (elem->>'order')::int = v_next_order
  ) INTO v_next_exists;

  IF NOT v_next_exists THEN
    RETURN jsonb_build_object('error','already_final_stage');
  END IF;
  IF NOT v_ready THEN
    RETURN jsonb_build_object('error','not_ready');
  END IF;

  -- Advance
  v_state := jsonb_set(v_state, '{active_order}', to_jsonb(v_next_order), true);
  v_state := jsonb_set(v_state, '{current_score}', to_jsonb(0), true); -- reset score
  v_state := jsonb_set(v_state, '{ready_for_next}', to_jsonb(false), true);
  -- track reached timestamp
  v_state := jsonb_set(v_state, '{reached}', (v_state->'reached') || jsonb_build_object(v_next_order::text, to_jsonb(v_now)), true);
  -- Clear regression artifacts
  v_state := v_state - 'regression_candidate_order';
  v_state := jsonb_set(v_state, '{pending_regression}', to_jsonb(false), true);

  UPDATE public.user_character_relationship_progress
    SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;$$;
