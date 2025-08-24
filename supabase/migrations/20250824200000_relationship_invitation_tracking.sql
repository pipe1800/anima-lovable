-- Migration: Relationship Invitation Tracking
-- Date: 2025-08-24
-- Purpose: Track one-time stage advancement invitation per readiness cycle.
-- Adds JSON state keys managed inside evaluate & advance functions and a unified RPC to set status.

-- 1. Helper function to set invitation status explicitly (asked/declined/reset)
CREATE OR REPLACE FUNCTION public.set_relationship_invitation_status(
  p_user_id uuid,
  p_character_id uuid,
  p_action text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_state jsonb;
  v_now timestamptz := now();
  v_active int;
  v_changed boolean := false;
BEGIN
  -- Lock row
  SELECT state INTO v_state FROM public.user_character_relationship_progress
    WHERE user_id = p_user_id AND character_id = p_character_id FOR UPDATE;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_state');
  END IF;
  v_active := COALESCE((v_state->>'active_order')::int,1);
  p_action := lower(p_action);

  IF p_action = 'asked' THEN
    -- Only set if currently ready_unasked
    IF COALESCE(v_state->>'invitation_status','') = 'ready_unasked' THEN
      v_state := jsonb_set(v_state,'{invitation_status}', to_jsonb('asked_pending'), true);
      v_state := jsonb_set(v_state,'{invitation_stage_order}', to_jsonb(v_active), true);
      v_state := jsonb_set(v_state,'{invitation_asked_at}', to_jsonb(v_now), true);
      v_state := v_state - 'invitation_declined_at';
      v_changed := true;
    END IF;
  ELSIF p_action = 'declined' THEN
    -- Only if asked_pending matches active stage
    IF COALESCE(v_state->>'invitation_status','') = 'asked_pending'
       AND COALESCE((v_state->>'invitation_stage_order')::int, v_active) = v_active THEN
      v_state := jsonb_set(v_state,'{invitation_status}', to_jsonb('asked_declined'), true);
      v_state := jsonb_set(v_state,'{invitation_declined_at}', to_jsonb(v_now), true);
      v_changed := true;
    END IF;
  ELSIF p_action = 'reset' THEN
    v_state := v_state - 'invitation_status' - 'invitation_stage_order' - 'invitation_asked_at' - 'invitation_declined_at';
    v_changed := true;
  ELSE
    RETURN jsonb_build_object('error','invalid_action');
  END IF;

  IF v_changed THEN
    UPDATE public.user_character_relationship_progress
      SET state = v_state
      WHERE user_id = p_user_id AND character_id = p_character_id;
  END IF;
  RETURN v_state;
END;$$;

GRANT EXECUTE ON FUNCTION public.set_relationship_invitation_status(uuid, uuid, text) TO authenticated, service_role;

-- 2. Patch evaluate_relationship_progress to manage invitation_status transitions.
-- We wrap existing function body logic; fetch existing definition, modify core, re-create.
-- NOTE: This assumes the latest version from earlier migrations; adjust if diverged.

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
  v_decay_rate numeric := 0.01; -- per hour
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
  v_inv_status text;
  v_inv_stage int;
BEGIN
  SELECT COALESCE(time_awareness_enabled,false) INTO v_time_enabled
    FROM public.user_character_settings
    WHERE user_id = p_user_id AND character_id = p_character_id;

  SELECT relationship_goals INTO v_template FROM public.character_latent_profiles WHERE character_id = p_character_id;
  IF v_template IS NULL OR jsonb_typeof(v_template) <> 'object' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_template');
  END IF;
  v_enabled := COALESCE((v_template->>'enabled')::boolean,false);
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
      'last_eval_at', v_now,
      'ready_for_next', false,
      'invitation_status', 'not_ready'
    );
    INSERT INTO public.user_character_relationship_progress(user_id, character_id, state)
      VALUES (p_user_id, p_character_id, v_state)
      ON CONFLICT (user_id, character_id) DO NOTHING;
    RETURN v_state;
  END IF;

  v_active_order := COALESCE((v_state->>'active_order')::int,1);
  v_score := COALESCE((v_state->>'current_score')::numeric,0);
  v_last_eval := COALESCE((v_state->>'last_eval_at')::timestamptz, v_now);
  v_negative_streak := COALESCE((v_state->>'negative_streak')::int,0);
  v_pending := COALESCE((v_state->>'pending_regression')::boolean,false);
  v_reg_candidate := CASE WHEN (v_state ? 'regression_candidate_order') THEN (v_state->>'regression_candidate_order')::int ELSE NULL END;
  v_decay_rate := COALESCE((v_state->>'decay_per_hour')::numeric, v_decay_rate);
  v_inv_status := COALESCE(v_state->>'invitation_status','not_ready');
  v_inv_stage := COALESCE((v_state->>'invitation_stage_order')::int, v_active_order);
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

  v_next_order := v_active_order + 1;
  SELECT (elem->>'threshold')::numeric INTO v_next_threshold
    FROM jsonb_array_elements(v_path) elem
    WHERE (elem->>'order')::int = v_next_order;

  IF v_next_threshold IS NOT NULL THEN
    v_ready_for_next := (v_score >= v_next_threshold);
  ELSE
    v_ready_for_next := false;
  END IF;

  -- Invitation state machine
  IF NOT v_ready_for_next THEN
    -- Reset invitation for this stage if we were ready before
    v_inv_status := 'not_ready';
    v_state := v_state - 'invitation_asked_at' - 'invitation_declined_at';
  ELSE
    -- ready_for_next true
    IF v_inv_stage <> v_active_order THEN
      -- Stage changed; reset invitation cycle
      v_inv_status := 'ready_unasked';
      v_state := v_state - 'invitation_asked_at' - 'invitation_declined_at';
      v_inv_stage := v_active_order;
    ELSE
      IF v_inv_status = 'not_ready' THEN
        v_inv_status := 'ready_unasked';
      END IF;
      -- asked_pending / asked_declined remain unchanged
    END IF;
  END IF;

  -- Regression detection
  IF v_active_order > 1 AND NOT v_pending THEN
    IF v_negative_streak >= 5 THEN
      v_pending := true;
      v_reg_candidate := v_active_order - 1;
    END IF;
  END IF;

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
  v_state := jsonb_set(v_state,'{invitation_status}', to_jsonb(v_inv_status), true);
  v_state := jsonb_set(v_state,'{invitation_stage_order}', to_jsonb(v_inv_stage), true);

  UPDATE public.user_character_relationship_progress
    SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;
  RETURN v_state;
END;$$;

-- 3. Patch advance_relationship_stage to clear invitation keys.
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
  v_reached jsonb := '{}'::jsonb;
BEGIN
  SELECT relationship_goals INTO v_template FROM public.character_latent_profiles WHERE character_id = p_character_id;
  IF v_template IS NULL OR jsonb_typeof(v_template) <> 'object' OR COALESCE((v_template->>'enabled')::boolean,false) = false THEN
    RETURN jsonb_build_object('error','template_missing_or_disabled');
  END IF;
  v_path := v_template->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RETURN jsonb_build_object('error','invalid_path');
  END IF;

  SELECT state INTO v_state FROM public.user_character_relationship_progress
    WHERE user_id = p_user_id AND character_id = p_character_id FOR UPDATE;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_state');
  END IF;

  v_active_order := COALESCE((v_state->>'active_order')::int,1);
  v_ready := COALESCE((v_state->>'ready_for_next')::boolean,false);
  v_next_order := v_active_order + 1;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_path) elem WHERE (elem->>'order')::int = v_next_order
  ) INTO v_next_exists;
  IF NOT v_next_exists THEN RETURN jsonb_build_object('error','already_final_stage'); END IF;
  IF NOT v_ready THEN RETURN jsonb_build_object('error','not_ready'); END IF;

  v_reached := COALESCE(v_state->'reached','{}'::jsonb);
  v_state := jsonb_set(v_state,'{active_order}', to_jsonb(v_next_order), true);
  v_state := jsonb_set(v_state,'{current_score}', to_jsonb(0), true);
  v_state := jsonb_set(v_state,'{ready_for_next}', to_jsonb(false), true);
  v_state := jsonb_set(v_state,'{reached}', v_reached || jsonb_build_object(v_next_order::text, to_jsonb(v_now)), true);
  v_state := v_state - 'regression_candidate_order';
  v_state := jsonb_set(v_state,'{pending_regression}', to_jsonb(false), true);
  v_state := v_state - 'next_threshold' - 'current_stage_threshold' - 'stage_progress_span' - 'stage_progress_percent';
  -- Clear invitation cycle
  v_state := v_state - 'invitation_status' - 'invitation_stage_order' - 'invitation_asked_at' - 'invitation_declined_at';

  UPDATE public.user_character_relationship_progress
    SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;
  RETURN v_state;
END;$$;

ALTER FUNCTION public.advance_relationship_stage(uuid, uuid) OWNER TO postgres;
