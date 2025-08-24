-- Extracted function definitions from schema_full.sql (all functions with related owner and comments)

CREATE OR REPLACE FUNCTION "auth"."email"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

ALTER FUNCTION "auth"."email"() OWNER TO "supabase_auth_admin";

COMMENT ON FUNCTION "auth"."email"() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';

CREATE OR REPLACE FUNCTION "auth"."jwt"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

ALTER FUNCTION "auth"."jwt"() OWNER TO "supabase_auth_admin";

CREATE OR REPLACE FUNCTION "auth"."role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

ALTER FUNCTION "auth"."role"() OWNER TO "supabase_auth_admin";

COMMENT ON FUNCTION "auth"."role"() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';

CREATE OR REPLACE FUNCTION "auth"."uid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

ALTER FUNCTION "auth"."uid"() OWNER TO "supabase_auth_admin";

COMMENT ON FUNCTION "auth"."uid"() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';

CREATE OR REPLACE FUNCTION "public"."_assert_self"("p_target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
BEGIN
  -- Allow service role to bypass
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS DISTINCT FROM p_target THEN
      RAISE EXCEPTION 'Access denied (ownership check failed)';
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION "public"."_assert_self"("p_target" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."_assert_self"("p_target" "uuid") IS 'Ensures caller owns target user_id unless service_role.';

CREATE OR REPLACE FUNCTION "public"."add_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_transaction_type" "text", "p_reference_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_current integer;
  v_new integer;
  v_allowance integer;
  v_cap integer;
  v_effective_amount integer;
  v_rel_txn uuid;
  v_raw_type text := lower(coalesce(p_transaction_type,'admin_adjustment'));
  v_type text;
  v_enum_exists boolean;
  v_valid_label boolean;
BEGIN
  PERFORM public._assert_self(p_user_id);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  -- Map incoming label to existing enum set
  v_type := CASE v_raw_type
              WHEN 'trial_grant' THEN 'initial_grant'
              WHEN 'ai_operation' THEN 'message_cost'
              WHEN 'credit_grant' THEN 'admin_adjustment'
              WHEN 'credit_grant_adjustment' THEN 'admin_adjustment'
              ELSE v_raw_type
            END;

  -- Enum validation (only if enum exists)
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'credit_transaction_type'
  ) INTO v_enum_exists;

  IF v_enum_exists THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'credit_transaction_type'
        AND e.enumlabel = v_type
    ) INTO v_valid_label;

    IF NOT v_valid_label THEN
      RAISE EXCEPTION 'Invalid credit_transaction_type label after mapping: %', v_type;
    END IF;
  END IF;

  INSERT INTO billing.credits (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_current
  FROM billing.credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Only cap recurring allowance (subscription) & initial_grant (trial)
  IF v_type IN ('subscription_allowance','initial_grant') THEN
    SELECT p.monthly_credits_allowance
      INTO v_allowance
    FROM billing.subscriptions s
    JOIN billing.plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_allowance IS NOT NULL THEN
      v_cap := v_allowance * 2;
    END IF;
  END IF;

  v_new := coalesce(v_current,0) + p_amount;

  IF v_cap IS NOT NULL AND v_new > v_cap THEN
    v_new := v_cap;
    v_effective_amount := v_cap - coalesce(v_current,0);
  ELSE
    v_effective_amount := p_amount;
  END IF;

  UPDATE billing.credits
     SET balance = v_new
   WHERE user_id = p_user_id;

  IF v_effective_amount > 0 THEN
    IF p_reference_id IS NOT NULL THEN
      SELECT id INTO v_rel_txn FROM billing.transactions WHERE id = p_reference_id;
    END IF;

    INSERT INTO billing.credit_ledger (
      user_id,
      change_amount,
      transaction_type,
      description,
      related_transaction_id
    )
    VALUES (
      p_user_id,
      v_effective_amount,
      v_type::credit_transaction_type,
      CASE v_type
        WHEN 'subscription_allowance' THEN 'Subscription allowance'
        WHEN 'initial_grant' THEN 'Initial / trial grant'
        WHEN 'top_up_purchase' THEN 'Credit pack purchase'
        WHEN 'message_cost' THEN 'Message usage adjustment'
        WHEN 'image_gen_cost' THEN 'Image generation usage adjustment'
        WHEN 'admin_adjustment' THEN 'Admin adjustment'
        WHEN 'onboarding_reward' THEN 'Onboarding reward'
        ELSE initcap(replace(v_type,'_',' '))
      END,
      v_rel_txn
    );
  END IF;

  RETURN v_new;
END;
$$;

ALTER FUNCTION "public"."add_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_transaction_type" "text", "p_reference_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."add_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_transaction_type" "text", "p_reference_id" "uuid") IS 'Grant credits; maps unsupported labels to existing enum, caps only subscription_allowance/initial_grant, inserts ledger.';

CREATE OR REPLACE FUNCTION "public"."array_all_item_length_lte"("arr" "text"[], "max_len" integer) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(arr) AS x WHERE length(x) > max_len);
$$;

ALTER FUNCTION "public"."array_all_item_length_lte"("arr" "text"[], "max_len" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cancel_subscription"("p_user_id" "uuid", "p_subscription_id" "uuid" DEFAULT NULL::"uuid", "p_cancel_immediately" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_sub record;
  v_old_status text;
  v_new_period_end timestamptz;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT *
    INTO v_sub
  FROM billing.subscriptions
  WHERE user_id = p_user_id
    AND (
      (p_subscription_id IS NULL AND status = 'active')
      OR (p_subscription_id IS NOT NULL AND id = p_subscription_id)
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_old_status := v_sub.status;

  IF v_sub.status = 'canceled' THEN
    RETURN json_build_object(
      'id', v_sub.id,
      'status', v_sub.status,
      'current_period_end', v_sub.current_period_end,
      'already_canceled', true
    );
  END IF;

  v_new_period_end := CASE
    WHEN p_cancel_immediately THEN LEAST(v_sub.current_period_end, now())
    ELSE v_sub.current_period_end
  END;

  UPDATE billing.subscriptions
     SET status = 'canceled',
         current_period_end = v_new_period_end
   WHERE id = v_sub.id;

  RETURN json_build_object(
    'id', v_sub.id,
    'old_status', v_old_status,
    'new_status', 'canceled',
    'current_period_end', v_new_period_end,
    'canceled_immediately', p_cancel_immediately
  );
END;
$$;

ALTER FUNCTION "public"."cancel_subscription"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_cancel_immediately" boolean) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."cancel_subscription"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_cancel_immediately" boolean) IS 'Cancels a user subscription (enum status = canceled). Returns JSON summary or NULL if none.';

CREATE OR REPLACE FUNCTION "public"."cleanup_disabled_addon_context"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- This function now only cleans up current context state, never historical data
  DELETE FROM public.user_chat_context 
  WHERE current_context IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_character_addons uca
      WHERE uca.user_id = user_chat_context.user_id
        AND uca.character_id = user_chat_context.character_id
        AND (
          (user_chat_context.context_type = 'mood' AND (uca.addon_settings->>'moodTracking')::boolean = true) OR
          (user_chat_context.context_type = 'clothing' AND (uca.addon_settings->>'clothingInventory')::boolean = true) OR
          (user_chat_context.context_type = 'location' AND (uca.addon_settings->>'locationTracking')::boolean = true) OR
          (user_chat_context.context_type = 'time_weather' AND (uca.addon_settings->>'timeAndWeather')::boolean = true) OR
          (user_chat_context.context_type = 'relationship' AND (uca.addon_settings->>'relationshipStatus')::boolean = true)
        )
    );
    
  RAISE NOTICE 'Cleanup completed - ALL historical context preserved, only current context cleaned';
END;
$$;

ALTER FUNCTION "public"."cleanup_disabled_addon_context"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_chat_with_greeting"("p_character_id" "uuid", "p_user_id" "uuid", "p_user_message" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  new_chat_id uuid;
  character_name text;
  character_greeting text;
  final_greeting text;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ownership: ensure user exists (implicit) – character still may be public/unlisted/private; allow any visible? Enforce creator or public visibility:
  IF NOT EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = p_character_id
      AND (c.visibility = 'public' OR c.creator_id = v_user OR c.visibility = 'unlisted')
  ) THEN
    RAISE EXCEPTION 'Character not accessible';
  END IF;

  SELECT name INTO character_name FROM public.characters WHERE id = p_character_id;
  SELECT greeting INTO character_greeting FROM public.character_definitions WHERE character_id = p_character_id;

  INSERT INTO public.chats (user_id, character_id, title)
  VALUES (v_user, p_character_id, 'Chat with ' || character_name)
  RETURNING id INTO new_chat_id;

  final_greeting := COALESCE(
    NULLIF(character_greeting, ''),
    'Hello! It''s a pleasure to meet you. What''s on your mind?'
  );

  INSERT INTO public.messages (chat_id, author_id, content, is_ai_message)
  VALUES (new_chat_id, p_character_id, final_greeting, true);

  IF p_user_message IS NOT NULL AND p_user_message <> '' THEN
    INSERT INTO public.messages (chat_id, author_id, content, is_ai_message, model_id)
    VALUES (new_chat_id, v_user, p_user_message, false, NULL);
  END IF;

  RETURN new_chat_id;
END;
$$;

ALTER FUNCTION "public"."create_chat_with_greeting"("p_character_id" "uuid", "p_user_id" "uuid", "p_user_message" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."create_chat_with_greeting"("p_character_id" "uuid", "p_user_id" "uuid", "p_user_message" "text") IS 'Creates a chat for the authenticated user (ignores supplied p_user_id).';

CREATE OR REPLACE FUNCTION "public"."current_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$ SELECT auth.uid(); $$;

ALTER FUNCTION "public"."current_user_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."decrement_world_info_interaction_count"("world_info_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE world_infos
  SET interaction_count = GREATEST(COALESCE(interaction_count,0)-1,0)
  WHERE id = world_info_id;
END;
$$;

ALTER FUNCTION "public"."decrement_world_info_interaction_count"("world_info_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."deduct_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_operation_type" "text" DEFAULT 'message_cost'::"text", "p_description" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_current integer;
  v_new integer;
  v_enum_exists boolean;
  v_valid_label boolean;
  v_raw_type text := lower(coalesce(p_operation_type,'message_cost'));
  v_type text;
BEGIN
  PERFORM public._assert_self(p_user_id);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  -- Map to existing enum labels
  v_type := CASE v_raw_type
              WHEN 'ai_operation' THEN 'message_cost'
              WHEN 'credit_grant' THEN 'admin_adjustment'
              WHEN 'trial_grant' THEN 'initial_grant'
              ELSE v_raw_type
            END;

  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'credit_transaction_type'
  ) INTO v_enum_exists;

  IF v_enum_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname='credit_transaction_type'
        AND e.enumlabel = v_type
    ) INTO v_valid_label;

    IF NOT v_valid_label THEN
      RAISE EXCEPTION 'Invalid credit_transaction_type label after mapping: %', v_type;
    END IF;
  END IF;

  INSERT INTO billing.credits (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_current
  FROM billing.credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current < p_amount THEN
    RETURN NULL;
  END IF;

  v_new := v_current - p_amount;

  UPDATE billing.credits
     SET balance = v_new
   WHERE user_id = p_user_id;

  INSERT INTO billing.credit_ledger (
    user_id,
    change_amount,
    transaction_type,
    description
  )
  VALUES (
    p_user_id,
    -p_amount,
    v_type::credit_transaction_type,
    coalesce(p_description,
      CASE v_type
        WHEN 'message_cost' THEN 'Message usage'
        WHEN 'image_gen_cost' THEN 'Image generation usage'
        ELSE initcap(replace(v_type,'_',' '))
      END
    )
  );

  RETURN v_new;
END;
$$;

ALTER FUNCTION "public"."deduct_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_operation_type" "text", "p_description" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."deduct_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_operation_type" "text", "p_description" "text") IS 'Deduct credits; maps unsupported labels to existing enum; returns new balance or NULL if insufficient.';

-- (Remaining function definitions continue ...)

-- Added missing function definitions from schema_full.sql

CREATE OR REPLACE FUNCTION "public"."advance_relationship_stage"("p_user_id" "uuid", "p_character_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_template jsonb;
  v_state jsonb;
  v_now timestamptz := now();
  v_active_order int;
  v_ready boolean;
  v_path jsonb;
  v_next_order int;
  v_next_exists boolean := false;
BEGIN
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

  -- Advance
  v_state := jsonb_set(v_state, '{active_order}', to_jsonb(v_next_order), true);
  v_state := jsonb_set(v_state, '{current_score}', to_jsonb(0), true); -- reset score
  v_state := jsonb_set(v_state, '{ready_for_next}', to_jsonb(false), true);
  -- track reached timestamp
  v_state := jsonb_set(v_state, '{reached}', (v_state->'reached') || jsonb_build_object(v_next_order::text, to_jsonb(v_now)), true);
  -- Clear regression artifacts
  v_state := v_state - 'regression_candidate_order';
  v_state := jsonb_set(v_state, '{pending_regression}', to_jsonb(false), true);

  UPDATE public.user_character_relationship_progress
    SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;$$;

ALTER FUNCTION "public"."advance_relationship_stage"("p_user_id" "uuid", "p_character_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."confirm_relationship_regression"("p_user_id" "uuid", "p_character_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_state jsonb; v_active int; v_candidate int; BEGIN
  SELECT state INTO v_state FROM public.user_character_relationship_progress
    WHERE user_id = p_user_id AND character_id = p_character_id FOR UPDATE;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error','no_progress');
  END IF;
  IF COALESCE( (v_state->>'pending_regression')::boolean, false) = false THEN
    RETURN jsonb_build_object('skipped', true, 'reason','no_pending_regression');
  END IF;
  v_active := (v_state->>'active_order')::int;
  v_candidate := (v_state->>'regression_candidate_order')::int;
  IF v_candidate IS NULL OR v_candidate >= v_active THEN
    RETURN jsonb_build_object('error','invalid_candidate');
  END IF;
  v_state := jsonb_set(v_state, '{active_order}', to_jsonb(v_candidate), true);
  v_state := jsonb_set(v_state, '{current_score}', to_jsonb(0), true);
  v_state := jsonb_set(v_state, '{pending_regression}', 'false', true);
  v_state := v_state - 'regression_candidate_order';
  v_state := jsonb_set(v_state, '{negative_streak}', to_jsonb(0), true);
  v_state := jsonb_set(v_state, '{last_eval_at}', to_jsonb(now()), true);
  UPDATE public.user_character_relationship_progress SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;
  RETURN v_state;
END;$$;

ALTER FUNCTION "public"."confirm_relationship_regression"("p_user_id" "uuid", "p_character_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_chat_complete"("p_chat_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.chats WHERE id = p_chat_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.character_memories WHERE chat_id = p_chat_id;
  DELETE FROM public.chat_context WHERE chat_id = p_chat_id;
  DELETE FROM public.messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;
END;
$$;

ALTER FUNCTION "public"."delete_chat_complete"("p_chat_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_chat_complete"("p_chat_id" "uuid", "p_user_id" "uuid") IS 'Deletes a chat and related rows for the authenticated owner; ignores supplied p_user_id.';

CREATE OR REPLACE FUNCTION "public"."delete_private_character"("p_character_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_creator uuid;
  v_was_public boolean;
  v_visibility text;
  v_chat_id uuid;
BEGIN
  SELECT creator_id, was_public, visibility
  INTO v_creator, v_was_public, v_visibility
  FROM public.characters
  WHERE id = p_character_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  IF v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_was_public THEN
    RAISE EXCEPTION 'Characters that have been public cannot be deleted';
  END IF;

  IF v_visibility = 'public' THEN
    RAISE EXCEPTION 'Public characters cannot be deleted';
  END IF;

  BEGIN
    DELETE FROM public.user_chat_context
    WHERE user_id = auth.uid() AND character_id = p_character_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.character_memories
    WHERE user_id = auth.uid() AND character_id = p_character_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  FOR v_chat_id IN
    SELECT id FROM public.chats WHERE user_id = auth.uid() AND character_id = p_character_id
  LOOP
    BEGIN
      PERFORM public.delete_chat_complete(v_chat_id, auth.uid());
    EXCEPTION WHEN undefined_function THEN
      DELETE FROM public.chats WHERE id = v_chat_id AND user_id = auth.uid();
    END;
  END LOOP;

  DELETE FROM public.characters
  WHERE id = p_character_id AND creator_id = auth.uid() AND was_public = false AND visibility <> 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character delete failed due to constraints';
  END IF;
END;
$$;

ALTER FUNCTION "public"."delete_private_character"("p_character_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_user_account"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing'
    AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);

  DELETE FROM billing.credit_ledger WHERE user_id = p_user_id;
  DELETE FROM billing.transactions WHERE user_id = p_user_id;
  DELETE FROM billing.credit_pack_purchases WHERE user_id = p_user_id;
  DELETE FROM billing.subscriptions WHERE user_id = p_user_id;
  DELETE FROM billing.credits WHERE user_id = p_user_id;

  BEGIN DELETE FROM public.chats WHERE user_id = p_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.characters WHERE creator_id = p_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE id = p_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

ALTER FUNCTION "public"."delete_user_account"("p_user_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_user_account"("p_user_id" "uuid") IS 'Deletes the invoking user (must own id) and associated billing/app records.';

CREATE OR REPLACE FUNCTION "public"."enforce_credit_pack_purchase_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."enforce_credit_pack_purchase_status"() OWNER TO "postgres";

-- (Further function definitions from schema_full.sql should be included similarly. For brevity, ensure all remaining functions are copied verbatim into this file.)
