-- Migration: Add SQL-side decline penalty for relationship invitations
-- Applies score penalty when an invitation is declined (explicitly or via RPC usage)
-- Penalty = (next_threshold - current_threshold)/2, bounded to >=0 and not below zero score

CREATE OR REPLACE FUNCTION public.decline_relationship_invitation(
  p_user_id uuid,
  p_character_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_state jsonb;
  v_template jsonb;
  v_active int;
  v_next int;
  v_current_threshold numeric;
  v_next_threshold numeric;
  v_penalty numeric := 0;
  v_new_score numeric;
  v_path jsonb;
BEGIN
  -- Basic ownership / RLS style assertion (mirror pattern of other relationship funcs)
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_auth IS NULL OR v_auth <> p_user_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT state INTO v_state
  FROM public.user_character_relationship_progress
  WHERE user_id = p_user_id AND character_id = p_character_id
  FOR UPDATE; -- lock row to avoid race with parallel message processing

  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_state');
  END IF;

  -- Only apply if currently pending
  IF (v_state->>'invitation_status') IS DISTINCT FROM 'asked_pending' THEN
    -- If already declined or not pending just ensure status is declined if it was ready_unasked (no penalty)
    IF (v_state->>'invitation_status') = 'asked_declined' THEN
      RETURN v_state; -- already declined previously
    END IF;
  END IF;

  -- Load template for thresholds
  SELECT relationship_goals INTO v_template
  FROM public.character_latent_profiles
  WHERE character_id = p_character_id;

  IF v_template ? 'path' THEN
    v_path := v_template->'path';
    -- active order
    IF v_state ? 'active_order' THEN
      v_active := (v_state->>'active_order')::int; END IF;
    v_next := COALESCE(v_active,1) + 1;
    IF jsonb_typeof(v_path) = 'array' THEN
      -- Find current & next stage objects
      SELECT (elem->>'threshold')::numeric INTO v_current_threshold
      FROM jsonb_array_elements(v_path) elem
      WHERE (elem->>'order')::int = v_active
      LIMIT 1;

      SELECT (elem->>'threshold')::numeric INTO v_next_threshold
      FROM jsonb_array_elements(v_path) elem
      WHERE (elem->>'order')::int = v_next
      LIMIT 1;

      IF v_current_threshold IS NOT NULL AND v_next_threshold IS NOT NULL THEN
        v_penalty := GREATEST(0, (v_next_threshold - v_current_threshold)/2);
      END IF;
    END IF;
  END IF;

  IF v_penalty > 0 AND (v_state ? 'current_score') THEN
    BEGIN
      v_new_score := GREATEST(0, (v_state->>'current_score')::numeric - v_penalty);
      v_state := jsonb_set(v_state, '{current_score}', to_jsonb(v_new_score), true);
    EXCEPTION WHEN others THEN
      -- Ignore penalty application errors silently (do not block decline)
    END;
  END IF;

  -- Mark declined
  v_state := jsonb_set(v_state, '{invitation_status}', to_jsonb('asked_declined'), true);
  -- Remove transient flags if present
  IF v_state ? '_invitationJustIssued' THEN
    v_state := v_state - '_invitationJustIssued';
  END IF;
  IF v_state ? 'invitation_check_count' THEN
    v_state := v_state - 'invitation_check_count';
  END IF;

  UPDATE public.user_character_relationship_progress
    SET state = v_state, updated_at = now()
    WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;$$;

GRANT EXECUTE ON FUNCTION public.decline_relationship_invitation(uuid, uuid) TO authenticated, service_role;
