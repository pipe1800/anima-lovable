-- Migration: Add consolidated relationship snapshot RPC
-- Purpose: Replace multiple frontend calls (fetch state + maybe evaluate + maybe promote invitation)
-- Provides atomic server-side logic to (a) load existing state, (b) optionally evaluate if stale, (c) optionally promote invitation

CREATE OR REPLACE FUNCTION public.get_or_evaluate_relationship_snapshot(
  p_user_id uuid,
  p_character_id uuid,
  p_force_eval boolean DEFAULT false,
  p_auto_promote boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state jsonb;
  v_now timestamptz := now();
  v_last_eval_at timestamptz;
  v_needs_eval boolean := false;
  v_tmp jsonb;
BEGIN
  -- Load existing state
  SELECT state INTO v_state FROM user_character_relationship_progress
   WHERE user_id = p_user_id AND character_id = p_character_id FOR UPDATE;

  IF v_state IS NULL THEN
    -- Perform initial evaluation to seed state
    v_state := public.evaluate_relationship_progress(p_user_id, p_character_id);
    v_state := v_state || jsonb_build_object('last_eval_at', extract(epoch FROM v_now)*1000);
    UPDATE user_character_relationship_progress SET state = v_state, updated_at = v_now
      WHERE user_id = p_user_id AND character_id = p_character_id;
    RETURN v_state;
  END IF;

  -- Determine staleness (60s) or explicit force
  v_last_eval_at := to_timestamp( COALESCE( (v_state->>'last_eval_at')::double precision / 1000, 0) );
  v_needs_eval := p_force_eval OR (v_now - v_last_eval_at) > interval '60 seconds' OR (v_state ? 'pending_regression') OR (v_state ? 'ready_for_next' AND NOT (v_state ? 'invitation_status'));

  IF v_needs_eval THEN
    v_tmp := public.evaluate_relationship_progress(p_user_id, p_character_id);
    IF v_tmp IS NOT NULL THEN
      v_state := v_tmp;
      v_state := v_state || jsonb_build_object('last_eval_at', extract(epoch FROM v_now)*1000);
      UPDATE user_character_relationship_progress SET state = v_state, updated_at = v_now
        WHERE user_id = p_user_id AND character_id = p_character_id;
    END IF;
  END IF;

  -- Auto promotion from ready_unasked -> asked_pending if requested
  IF p_auto_promote AND (v_state->>'ready_for_next')::boolean IS TRUE AND v_state->>'invitation_status' = 'ready_unasked' THEN
    v_tmp := public.set_relationship_invitation_status(p_user_id, p_character_id, 'asked');
    IF v_tmp IS NOT NULL THEN
      v_state := v_tmp; -- function already returns updated structure
      v_state := v_state || jsonb_build_object('_invitationJustIssued', true);
      UPDATE user_character_relationship_progress SET state = v_state, updated_at = v_now
        WHERE user_id = p_user_id AND character_id = p_character_id;
    END IF;
  END IF;

  RETURN v_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_evaluate_relationship_snapshot(uuid, uuid, boolean, boolean) TO authenticated, service_role;
