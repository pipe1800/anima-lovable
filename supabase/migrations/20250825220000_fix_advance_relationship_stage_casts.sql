-- Fix polymorphic type error in advance_relationship_stage by casting string literals explicitly
-- Previous implementation used to_jsonb('not_ready') / to_jsonb('final') which can surface
-- "could not determine polymorphic type because input has type unknown" in some contexts.
-- We wrap literals with explicit ::text casts.

CREATE OR REPLACE FUNCTION public.advance_relationship_stage(p_user_id uuid, p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template jsonb;
  v_path jsonb;
  v_state jsonb;
  v_now timestamptz := now();
  v_active_order int;
  v_next_order int;
  v_next_exists boolean := false;
  v_new_active_threshold numeric := 0;
  v_next_threshold numeric := null;
  v_reached jsonb := '{}'::jsonb;
BEGIN
  -- Load template
  SELECT relationship_goals INTO v_template
    FROM public.character_latent_profiles
   WHERE character_id = p_character_id;

  IF v_template IS NULL
     OR jsonb_typeof(v_template) <> 'object'
     OR coalesce((v_template->>'enabled')::boolean,false)=false THEN
    RETURN jsonb_build_object('error','template_missing_or_disabled');
  END IF;

  v_path := v_template->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RETURN jsonb_build_object('error','invalid_path');
  END IF;

  -- Lock state
  SELECT state INTO v_state
    FROM public.user_character_relationship_progress
   WHERE user_id = p_user_id
     AND character_id = p_character_id
   FOR UPDATE;

  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_state');
  END IF;

  v_active_order := coalesce((v_state->>'active_order')::int,1);
  v_next_order := v_active_order + 1;

  -- Ensure next exists
  SELECT exists (
    SELECT 1 FROM jsonb_array_elements(v_path) elem
     WHERE (elem->>'order')::int = v_next_order
  ) INTO v_next_exists;

  IF NOT v_next_exists THEN
    RETURN jsonb_build_object('error','already_final_stage');
  END IF;

  -- Must be ready
  IF coalesce((v_state->>'ready_for_next')::boolean,false) = false THEN
    RETURN jsonb_build_object('error','not_ready');
  END IF;

  -- Promote
  v_reached := coalesce(v_state->'reached','{}'::jsonb);
  v_state := jsonb_set(v_state,'{active_order}', to_jsonb(v_next_order), true);
  v_state := jsonb_set(v_state,'{current_score}', to_jsonb(0), true);
  v_state := jsonb_set(v_state,'{ready_for_next}', to_jsonb(false), true);
  v_state := jsonb_set(v_state,'{reached}', v_reached || jsonb_build_object(v_next_order::text, to_jsonb(v_now)), true);
  v_state := v_state - 'regression_candidate_order';
  v_state := jsonb_set(v_state,'{pending_regression}', to_jsonb(false), true);

  -- Recompute thresholds for new active order
  IF v_next_order > 1 THEN
    SELECT (elem->>'threshold')::numeric
      INTO v_new_active_threshold
      FROM jsonb_array_elements(v_path) elem
     WHERE (elem->>'order')::int = v_next_order;
    IF v_new_active_threshold IS NULL THEN
      v_new_active_threshold := 0;
    END IF;
  ELSE
    v_new_active_threshold := 0;
  END IF;

  -- Next stage threshold (look ahead)
  SELECT (elem->>'threshold')::numeric
    INTO v_next_threshold
    FROM jsonb_array_elements(v_path) elem
   WHERE (elem->>'order')::int = (v_next_order + 1);

  -- Reset invitation cycle & set thresholds directly
  v_state := v_state
    - 'invitation_status'
    - 'invitation_stage_order'
    - 'invitation_asked_at'
    - 'invitation_declined_at'
    - 'next_threshold'
    - 'current_stage_threshold'
    - 'stage_progress_span'
    - 'stage_progress_percent';

  v_state := jsonb_set(v_state,'{current_stage_threshold}', to_jsonb(v_new_active_threshold), true);

  IF v_next_threshold IS NOT NULL THEN
    v_state := jsonb_set(v_state,'{next_threshold}', to_jsonb(v_next_threshold), true);
    v_state := jsonb_set(v_state,'{invitation_status}', to_jsonb('not_ready'::text), true); -- explicit cast
  ELSE
    v_state := jsonb_set(v_state,'{invitation_status}', to_jsonb('final'::text), true); -- explicit cast
  END IF;

  v_state := jsonb_set(v_state,'{invitation_stage_order}', to_jsonb(v_next_order), true);
  v_state := jsonb_set(v_state,'{last_eval_at}', to_jsonb(v_now), true);

  UPDATE public.user_character_relationship_progress
     SET state = v_state
   WHERE user_id = p_user_id
     AND character_id = p_character_id;

  RETURN v_state;
END;
$$;
