-- Migration: Relationship scoring support (batch signal + immediate evaluation)
-- Date: 2025-08-22
-- Adds helper RPC to apply an aggregated ML scoring weight every N messages
-- and return updated progress state (including stage_progress_percent)

-- 1. Helper function: apply_relationship_batch_signal
-- Inserts one positive signal (kind default 'ml_eval') with provided weight
-- then calls evaluate_relationship_progress and returns composite JSON:
-- {
--   state: <relationship_progress_state>,
--   applied_weight: <numeric>,
--   active_order: <int>,
--   stage_progress_percent: <numeric|null>,
--   ready_for_next: <bool>
-- }

CREATE OR REPLACE FUNCTION public.apply_relationship_batch_signal(
  p_user_id uuid,
  p_character_id uuid,
  p_weight numeric,
  p_last_message_id uuid DEFAULT NULL,
  p_kind text DEFAULT 'ml_eval'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_state jsonb;
  v_weight numeric := p_weight;
BEGIN
  IF v_auth IS NULL OR v_auth <> p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_weight IS NULL OR v_weight <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason','non_positive_weight');
  END IF;
  -- Cap absurd weights (defense-in-depth)
  IF v_weight > 50 THEN
    v_weight := 50; -- hard ceiling
  END IF;

  -- Insert signal
  PERFORM public.record_relationship_signal(p_user_id, p_character_id, COALESCE(p_kind,'ml_eval'), v_weight, 1, p_last_message_id);

  -- Evaluate immediately
  SELECT public.evaluate_relationship_progress(p_user_id, p_character_id) INTO v_state;

  RETURN jsonb_build_object(
    'state', v_state,
    'applied_weight', v_weight,
    'active_order', (v_state->>'active_order')::int,
    'stage_progress_percent', (v_state->>'stage_progress_percent')::numeric,
    'ready_for_next', COALESCE((v_state->>'ready_for_next')::boolean,false)
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.apply_relationship_batch_signal(uuid, uuid, numeric, uuid, text) TO authenticated, service_role;

-- 2. Convenience view: current relationship progress flattened (optional for UI / debugging)
-- Safe to create or replace; exposes only caller's own row via RLS.
CREATE OR REPLACE VIEW public.v_user_relationship_progress AS
SELECT
  ucrp.user_id,
  ucrp.character_id,
  ucrp.state->>'active_order'                AS active_order,
  (ucrp.state->>'current_score')::numeric    AS current_score,
  (ucrp.state->>'stage_progress_percent')::numeric AS stage_progress_percent,
  (ucrp.state->>'ready_for_next')::boolean   AS ready_for_next,
  (ucrp.state->>'next_threshold')::numeric   AS next_threshold,
  (ucrp.state->>'current_stage_threshold')::numeric AS current_stage_threshold,
  ucrp.updated_at
FROM public.user_character_relationship_progress ucrp;

-- Ensure SELECT granted (RLS still applies)
GRANT SELECT ON public.v_user_relationship_progress TO authenticated, service_role;
