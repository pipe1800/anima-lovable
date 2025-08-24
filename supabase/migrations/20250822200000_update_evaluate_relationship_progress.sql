-- Migration: Update evaluate_relationship_progress to remove hard gate on time awareness
-- Date: 2025-08-22
-- Only apply decay when time awareness enabled; always evaluate signals & advancement

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
  v_progress jsonb;
BEGIN
  SELECT COALESCE(time_awareness_enabled,false) INTO v_time_enabled
    FROM public.user_character_settings
    WHERE user_id = p_user_id AND character_id = p_character_id;

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
    RETURN v_state;
  END IF;

  v_active_order := COALESCE( (v_state->>'active_order')::int, 1 );
  v_score := COALESCE( (v_state->>'current_score')::numeric, 0 );
  v_last_eval := COALESCE( (v_state->>'last_eval_at')::timestamptz, v_now );
  v_negative_streak := COALESCE( (v_state->>'negative_streak')::int, 0 );
  v_pending := COALESCE( (v_state->>'pending_regression')::boolean, false );
  v_reg_candidate := CASE WHEN (v_state ? 'regression_candidate_order') THEN (v_state->>'regression_candidate_order')::int ELSE NULL END;
  v_decay_rate := COALESCE( (v_state->>'decay_per_hour')::numeric, v_decay_rate );
  v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - v_last_eval))/3600.0;

  IF v_time_enabled AND v_elapsed_hours > 0 THEN
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

  v_next_order := v_active_order + 1;
  SELECT (elem->>'threshold')::numeric INTO v_next_threshold
  FROM jsonb_array_elements(v_path) elem
  WHERE (elem->>'order')::int = v_next_order;

  IF v_next_threshold IS NOT NULL AND v_score >= v_next_threshold THEN
    v_active_order := v_next_order;
    v_score := ROUND(v_next_threshold * 0.30, 3);
    v_state := jsonb_set(v_state, '{reached}', (v_state->'reached') || jsonb_build_object(v_next_order::text, to_jsonb(v_now)), true);
    v_negative_streak := 0;
    v_pending := false;
    v_reg_candidate := NULL;
    v_state := v_state - 'regression_prompt_asked';
  END IF;

  IF v_active_order > 1 AND NOT v_pending THEN
    IF v_negative_streak >= 5 THEN
      v_pending := true;
      v_reg_candidate := v_active_order - 1;
    END IF;
  END IF;

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
