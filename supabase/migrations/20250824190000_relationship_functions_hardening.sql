-- Migration: Hardening relationship advancement functions
-- Date: 2025-08-24
-- Purpose:
--  * Harden advance_relationship_stage against stale progress metrics
--  * Clear stage-specific progress fields upon advancement so callers do not see inconsistent percentages
--  * Coalesce reached history to avoid NULL concatenation edge cases
--  * (Optional) Self assertion for security (commented out; enable if desired)

-- NOTE: evaluate_relationship_progress already re-computes stage_progress_percent etc.
--       We defensively remove them here so even if caller skips immediate evaluation the
--       state won't misleadingly report 100% completion of previous stage.

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
  -- Security (uncomment if you want to enforce caller identity)
  -- PERFORM public._assert_self(p_user_id);

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

  -- Prepare reached map
  v_reached := COALESCE(v_state->'reached','{}'::jsonb);

  -- Advance
  v_state := jsonb_set(v_state, '{active_order}', to_jsonb(v_next_order), true);
  v_state := jsonb_set(v_state, '{current_score}', to_jsonb(0), true); -- reset score for new stage
  v_state := jsonb_set(v_state, '{ready_for_next}', to_jsonb(false), true);
  v_state := jsonb_set(v_state, '{reached}', v_reached || jsonb_build_object(v_next_order::text, to_jsonb(v_now)), true);
  -- Clear regression artifacts
  v_state := v_state - 'regression_candidate_order';
  v_state := jsonb_set(v_state, '{pending_regression}', to_jsonb(false), true);
  -- Remove stage progress cached fields so caller must re-evaluate
  v_state := v_state - 'next_threshold' - 'current_stage_threshold' - 'stage_progress_span' - 'stage_progress_percent';

  UPDATE public.user_character_relationship_progress
    SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;$$;

ALTER FUNCTION public.advance_relationship_stage(uuid, uuid) OWNER TO postgres;
