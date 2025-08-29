-- Migration: Store only raw relationship stage label (remove "Stage x/x:" prefix)
-- This updates sync_relationship_context_for_chat to persist just the active stage label (optionally description removed)

CREATE OR REPLACE FUNCTION public.sync_relationship_context_for_chat(
  p_user_id uuid,
  p_character_id uuid,
  p_chat_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_state jsonb;
  v_goals jsonb;
  v_active int;
  v_label text;
  v_desc text;
  v_rel text;
  v_ctx jsonb;
  v_changed boolean := false;
BEGIN
  -- Auth check
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_auth IS NULL OR v_auth <> p_user_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT state INTO v_state
  FROM public.user_character_relationship_progress
  WHERE user_id = p_user_id AND character_id = p_character_id;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_state');
  END IF;

  SELECT relationship_goals INTO v_goals
  FROM public.character_latent_profiles
  WHERE character_id = p_character_id;
  IF v_goals IS NULL OR jsonb_typeof(v_goals) <> 'object' OR NOT (v_goals ? 'path') THEN
    RETURN jsonb_build_object('error','no_goals');
  END IF;

  v_active := COALESCE((v_state->>'active_order')::int, 1);
  SELECT elem->>'label', elem->>'description'
    INTO v_label, v_desc
  FROM jsonb_array_elements(v_goals->'path') elem
  WHERE (elem->>'order')::int = v_active
  LIMIT 1;
  IF v_label IS NULL THEN
    RETURN jsonb_build_object('error','active_stage_missing');
  END IF;

  -- New format: just label (drop description for consistency with edge function change)
  v_rel := v_label;

  SELECT current_context INTO v_ctx
  FROM public.chat_context
  WHERE chat_id = p_chat_id AND user_id = p_user_id AND character_id = p_character_id
  FOR UPDATE;

  IF v_ctx IS NULL THEN
    v_ctx := jsonb_build_object('relationship', v_rel);
    INSERT INTO public.chat_context (chat_id, user_id, character_id, current_context, updated_at)
    VALUES (p_chat_id, p_user_id, p_character_id, v_ctx, now())
    ON CONFLICT (chat_id) DO UPDATE SET current_context = EXCLUDED.current_context, updated_at = now();
    v_changed := true;
  ELSE
    IF (v_ctx->>'relationship') IS DISTINCT FROM v_rel THEN
      v_ctx := jsonb_set(v_ctx, '{relationship}', to_jsonb(v_rel), true);
      UPDATE public.chat_context
        SET current_context = v_ctx, updated_at = now()
        WHERE chat_id = p_chat_id;
      v_changed := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('chat_id', p_chat_id, 'relationship', v_rel, 'changed', v_changed);
END;$$;

GRANT EXECUTE ON FUNCTION public.sync_relationship_context_for_chat(uuid, uuid, uuid) TO authenticated, service_role;
