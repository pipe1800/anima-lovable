-- Adds per-stage progress percent without breaking existing keys
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
  v_decay_rate numeric := 0.01;
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
  v_current_stage_threshold numeric := 0;
  v_prev_order int;
  v_stage_span numeric := NULL;
  v_stage_progress_percent numeric := NULL;
BEGIN
  SELECT COALESCE(time_awareness_enabled,false) INTO v_time_enabled
  FROM public.user_character_settings
  WHERE user_id = p_user_id AND character_id = p_character_id;

  SELECT relationship_goals INTO v_template
  FROM public.character_latent_profiles
  WHERE character_id = p_character_id;

  IF v_template IS NULL OR jsonb_typeof(v_template) <> 'object' THEN
    RETURN jsonb_build_object('skipped', true, 'reason','no_template');
  END IF;
  v_enabled := COALESCE((v_template->>'enabled')::boolean,false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason','template_disabled');
  END IF;

  v_path := v_template->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RETURN jsonb_build_object('skipped', true, 'reason','invalid_path');
  END IF;

  SELECT state INTO v_state
  FROM public.user_character_relationship_progress
  WHERE user_id = p_user_id AND character_id = p_character_id
  FOR UPDATE;

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
    -- Seed extra fields (no next yet)
    v_state := jsonb_set(v_state,'{current_stage_threshold}',to_jsonb(0), true);
    v_state := jsonb_set(v_state,'{stage_progress_span}', 'null', true);
    v_state := jsonb_set(v_state,'{stage_progress_percent}','0', true);
    RETURN v_state;
  END IF;

  v_active_order := COALESCE((v_state->>'active_order')::int,1);
  v_score := COALESCE((v_state->>'current_score')::numeric,0);
  v_last_eval := COALESCE((v_state->>'last_eval_at')::timestamptz, v_now);
  v_negative_streak := COALESCE((v_state->>'negative_streak')::int,0);
  v_pending := COALESCE((v_state->>'pending_regression')::boolean,false);
  v_reg_candidate := CASE WHEN (v_state ? 'regression_candidate_order')
                      THEN (v_state->>'regression_candidate_order')::int ELSE NULL END;
  v_decay_rate := COALESCE((v_state->>'decay_per_hour')::numeric, v_decay_rate);
  v_ready_for_next := COALESCE((v_state->>'ready_for_next')::boolean,false);
  v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - v_last_eval))/3600.0;

  IF v_time_enabled AND v_elapsed_hours > 0 THEN
    v_score := GREATEST(0, v_score - (v_decay_rate * v_elapsed_hours));
  END IF;

  SELECT COALESCE(SUM(CASE WHEN polarity = 1 THEN weight ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN polarity = -1 THEN 1 ELSE 0 END),0)
    INTO v_positive_sum, v_negative_cnt
  FROM public.user_character_relationship_signals
  WHERE user_id = p_user_id AND character_id = p_character_id AND created_at > v_last_eval;

  v_score := v_score + v_positive_sum;
  v_negative_streak := v_negative_streak + v_negative_cnt;

  -- Determine thresholds (current & next)
  -- current stage threshold (cumulative target that was needed to ENTER this stage)
  -- For stage 1 treat baseline = 0 unless a threshold is explicitly defined
  IF v_active_order > 1 THEN
    SELECT (elem->>'threshold')::numeric INTO v_current_stage_threshold
    FROM jsonb_array_elements(v_path) elem
    WHERE (elem->>'order')::int = v_active_order;
    -- fallback if null
    IF v_current_stage_threshold IS NULL THEN
      v_current_stage_threshold := 0;
    END IF;
  ELSE
    -- Stage 1: baseline 0 even if path[order=1] has threshold (that threshold is to *enter* stage 1; already satisfied)
    v_current_stage_threshold := 0;
  END IF;

  v_next_order := v_active_order + 1;
  SELECT (elem->>'threshold')::numeric INTO v_next_threshold
  FROM jsonb_array_elements(v_path) elem
  WHERE (elem->>'order')::int = v_next_order;

  IF v_next_threshold IS NOT NULL THEN
    v_ready_for_next := (v_score + v_current_stage_threshold >= v_next_threshold);
    v_stage_span := v_next_threshold - v_current_stage_threshold;
    IF v_stage_span > 0 THEN
      v_stage_progress_percent := LEAST(1, v_score / v_stage_span);
    ELSE
      v_stage_progress_percent := NULL;
    END IF;
  ELSE
    -- Final stage: no next threshold; treat progress as 1 (complete) and span null
    v_ready_for_next := false;
    v_stage_span := NULL;
    v_stage_progress_percent := 1;
  END IF;

  IF v_active_order > 1 AND NOT v_pending THEN
    IF v_negative_streak >= 5 THEN
      v_pending := true;
      v_reg_candidate := v_active_order - 1;
    END IF;
  END IF;

  -- Persist
  v_state := jsonb_set(v_state,'{active_order}', to_jsonb(v_active_order), true);
  v_state := jsonb_set(v_state,'{current_score}', to_jsonb(v_score), true);
  v_state := jsonb_set(v_state,'{negative_streak}', to_jsonb(v_negative_streak), true);
  v_state := jsonb_set(v_state,'{pending_regression}', to_jsonb(v_pending), true);
  IF v_reg_candidate IS NULL THEN
    v_state := v_state - 'regression_candidate_order';
  ELSE
    v_state := jsonb_set(v_state,'{regression_candidate_order}', to_jsonb(v_reg_candidate), true);
  END IF;
  v_state := jsonb_set(v_state,'{last_eval_at}', to_jsonb(v_now), true);
  v_state := jsonb_set(v_state,'{ready_for_next}', to_jsonb(v_ready_for_next), true);

  IF v_next_threshold IS NOT NULL THEN
    v_state := jsonb_set(v_state,'{next_threshold}', to_jsonb(v_next_threshold), true);
  ELSE
    v_state := v_state - 'next_threshold';
  END IF;

  v_state := jsonb_set(v_state,'{current_stage_threshold}', to_jsonb(v_current_stage_threshold), true);
  IF v_stage_span IS NOT NULL THEN
    v_state := jsonb_set(v_state,'{stage_progress_span}', to_jsonb(v_stage_span), true);
  ELSE
    v_state := v_state - 'stage_progress_span';
  END IF;
  IF v_stage_progress_percent IS NOT NULL THEN
    v_state := jsonb_set(v_state,'{stage_progress_percent}', to_jsonb(v_stage_progress_percent), true);
  ELSE
    v_state := v_state - 'stage_progress_percent';
  END IF;

  UPDATE public.user_character_relationship_progress
    SET state = v_state
  WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;$$;