-- Migration: Enforce chat_context.current_context.relationship always reflects active stage
-- If character_latent_profiles.relationship_goals is not null, keep chat_context synchronized

CREATE OR REPLACE FUNCTION public.sync_relationship_context(
  p_user_id uuid,
  p_character_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state jsonb;
  v_goals jsonb;
  v_active int;
  v_total int;
  v_label text;
  v_desc text;
  v_rel text;
BEGIN
  -- Fetch progress state
  SELECT state INTO v_state
  FROM public.user_character_relationship_progress
  WHERE user_id = p_user_id AND character_id = p_character_id;

  IF v_state IS NULL THEN
    RETURN; -- nothing to do
  END IF;

  -- Fetch goals template
  SELECT relationship_goals INTO v_goals
  FROM public.character_latent_profiles
  WHERE character_id = p_character_id;

  IF v_goals IS NULL OR jsonb_typeof(v_goals) <> 'object' OR NOT (v_goals ? 'path') THEN
    RETURN; -- no goals defined
  END IF;

  v_active := COALESCE((v_state->>'active_order')::int, 1);
  v_total := COALESCE( jsonb_array_length(v_goals->'path'), 0 );
  IF v_total = 0 THEN RETURN; END IF;

  -- Extract active stage label & description
  SELECT elem->>'label', elem->>'description'
    INTO v_label, v_desc
  FROM jsonb_array_elements(v_goals->'path') elem
  WHERE (elem->>'order')::int = v_active
  LIMIT 1;

  IF v_label IS NULL THEN
    RETURN; -- malformed path
  END IF;

  v_rel := format('Stage %s/%s: %s', v_active, v_total, v_label);
  IF v_desc IS NOT NULL AND length(trim(v_desc)) > 0 THEN
    v_rel := v_rel || ' - ' || v_desc;
  END IF;

  -- Update all chat_context rows for this user+character
  UPDATE public.chat_context
    SET current_context = jsonb_set(
        COALESCE(current_context, '{}'::jsonb),
        '{relationship}',
        to_jsonb(v_rel), true
      ),
        updated_at = now()
  WHERE user_id = p_user_id AND character_id = p_character_id;
END;$$;

GRANT EXECUTE ON FUNCTION public.sync_relationship_context(uuid, uuid) TO authenticated, service_role;

-- Trigger after progress changes (stage advancement / decline etc.)
CREATE OR REPLACE FUNCTION public.trg_sync_relationship_context_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_relationship_context(NEW.user_id, NEW.character_id);
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_sync_relationship_context_progress ON public.user_character_relationship_progress;
CREATE TRIGGER trg_sync_relationship_context_progress
AFTER INSERT OR UPDATE OF state ON public.user_character_relationship_progress
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_relationship_context_progress();

-- Trigger after goals template updates
CREATE OR REPLACE FUNCTION public.trg_sync_relationship_context_goals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- For each user having progress with this character, resync
  FOR v_user_id IN
    SELECT user_id FROM public.user_character_relationship_progress WHERE character_id = NEW.character_id
  LOOP
    PERFORM public.sync_relationship_context(v_user_id, NEW.character_id);
  END LOOP;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_sync_relationship_context_goals ON public.character_latent_profiles;
CREATE TRIGGER trg_sync_relationship_context_goals
AFTER UPDATE OF relationship_goals ON public.character_latent_profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_relationship_context_goals();
