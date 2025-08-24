

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "auth";


ALTER SCHEMA "auth" OWNER TO "supabase_admin";


CREATE SCHEMA IF NOT EXISTS "billing";


ALTER SCHEMA "billing" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "auth"."aal_level" AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


ALTER TYPE "auth"."aal_level" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."code_challenge_method" AS ENUM (
    's256',
    'plain'
);


ALTER TYPE "auth"."code_challenge_method" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."factor_status" AS ENUM (
    'unverified',
    'verified'
);


ALTER TYPE "auth"."factor_status" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."factor_type" AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


ALTER TYPE "auth"."factor_type" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."one_time_token_type" AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


ALTER TYPE "auth"."one_time_token_type" OWNER TO "supabase_auth_admin";


CREATE TYPE "billing"."credit_transaction_type" AS ENUM (
    'initial_grant',
    'subscription_allowance',
    'top_up_purchase',
    'message_cost',
    'image_gen_cost',
    'admin_adjustment',
    'onboarding_reward'
);


ALTER TYPE "billing"."credit_transaction_type" OWNER TO "postgres";


CREATE TYPE "billing"."gateway_type" AS ENUM (
    'stripe',
    'paypal'
);


ALTER TYPE "billing"."gateway_type" OWNER TO "postgres";


CREATE TYPE "billing"."model_tier" AS ENUM (
    'standard',
    'premium',
    'experimental'
);


ALTER TYPE "billing"."model_tier" OWNER TO "postgres";


CREATE TYPE "billing"."subscription_status" AS ENUM (
    'active',
    'past_due',
    'canceled',
    'trialing'
);


ALTER TYPE "billing"."subscription_status" OWNER TO "postgres";


CREATE TYPE "billing"."transaction_purchase_type" AS ENUM (
    'subscription',
    'credit_pack'
);


ALTER TYPE "billing"."transaction_purchase_type" OWNER TO "postgres";


CREATE TYPE "billing"."transaction_status" AS ENUM (
    'succeeded',
    'pending',
    'failed'
);


ALTER TYPE "billing"."transaction_status" OWNER TO "postgres";


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

  v_type := CASE v_raw_type
              WHEN 'trial_grant' THEN 'initial_grant'
              WHEN 'ai_operation' THEN 'message_cost'
              WHEN 'credit_grant' THEN 'admin_adjustment'
              WHEN 'credit_grant_adjustment' THEN 'admin_adjustment'
              ELSE v_raw_type
            END;

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


COMMENT ON FUNCTION "public"."add_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_transaction_type" "text", "p_reference_id" "uuid") IS 'Grant credits with enum-safe casting; maps labels and caps only subscription_allowance/initial_grant.';



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
    RETURN NULL; -- insufficient credits
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


COMMENT ON FUNCTION "public"."deduct_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_operation_type" "text", "p_description" "text") IS 'Deduct credits with enum-safe casting; returns new balance or NULL if insufficient.';



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

  -- Cascade deletes (RLS bypassed here due to SECURITY DEFINER, ownership verified)
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
  -- Fetch character ownership and visibility flags
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

  -- Clean up per-user context tied to this character
  -- 1) user_chat_context rows for this user & character (if table exists)
  BEGIN
    DELETE FROM public.user_chat_context
    WHERE user_id = auth.uid() AND character_id = p_character_id;
  EXCEPTION WHEN undefined_table THEN
    -- ignore if table doesn't exist in this environment
    NULL;
  END;

  -- 2) character_memories for this user & character (if table exists)
  BEGIN
    DELETE FROM public.character_memories
    WHERE user_id = auth.uid() AND character_id = p_character_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- 3) Delete all chats for this user & character using existing helper (if exists)
  FOR v_chat_id IN
    SELECT id FROM public.chats WHERE user_id = auth.uid() AND character_id = p_character_id
  LOOP
    BEGIN
      PERFORM public.delete_chat_complete(v_chat_id, auth.uid());
    EXCEPTION WHEN undefined_function THEN
      -- Fallback: direct delete with cascades
      DELETE FROM public.chats WHERE id = v_chat_id AND user_id = auth.uid();
    END;
  END LOOP;

  -- 4) Finally delete the character (will cascade to definitions, tags, likes, favorites, etc.)
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

  -- Billing cleanup
  DELETE FROM billing.credit_ledger WHERE user_id = p_user_id;
  DELETE FROM billing.transactions WHERE user_id = p_user_id;
  DELETE FROM billing.credit_pack_purchases WHERE user_id = p_user_id;
  DELETE FROM billing.subscriptions WHERE user_id = p_user_id;
  DELETE FROM billing.credits WHERE user_id = p_user_id;

  -- App domain cleanup (best effort)
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


CREATE OR REPLACE FUNCTION "public"."evaluate_relationship_progress"("p_user_id" "uuid", "p_character_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."evaluate_relationship_progress"("p_user_id" "uuid", "p_character_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fetch_world_info_full"("p_world_info_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', wi.id,
    'name', wi.name,
    'short_description', wi.short_description,
    'visibility', wi.visibility,
    'creator_id', wi.creator_id,
    'likes_count', wi.likes_count,
    'interaction_count', wi.interaction_count,
    'created_at', wi.created_at,
    'updated_at', wi.updated_at,
    'creator', to_jsonb(pr) - 'id',
    'entries', COALESCE(e.entries, '[]'::jsonb),
    'tags', COALESCE(t.tags, '[]'::jsonb),
    'is_liked', CASE WHEN v_user_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM world_info_user_likes l 
        WHERE l.world_info_id = wi.id AND l.user_id = v_user_id
      ) THEN true ELSE false END,
    -- is_used deprecated (table world_info_users absent); returning false placeholder
    'is_used', false
  ) INTO v_result
  FROM world_infos wi
  LEFT JOIN profiles pr ON pr.id = wi.creator_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', we.id,
      'keywords', we.keywords,
      'entry_text', we.entry_text,
      'created_at', we.created_at
    ) ORDER BY we.created_at DESC) AS entries
    FROM world_info_entries we
    WHERE we.world_info_id = wi.id
  ) e ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name) ORDER BY tg.name) AS tags
    FROM world_info_tags wit
    JOIN tags tg ON tg.id = wit.tag_id
    WHERE wit.world_info_id = wi.id
  ) t ON TRUE
  WHERE wi.id = p_world_info_id
    AND (
      wi.visibility = 'public'
      OR (v_user_id IS NOT NULL AND wi.creator_id = v_user_id)
      OR (v_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM world_info_user_likes l 
          WHERE l.world_info_id = wi.id AND l.user_id = v_user_id
        ))
    );

  IF v_result IS NULL THEN
    RETURN NULL; -- Access denied or not found
  END IF;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."fetch_world_info_full"("p_world_info_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fetch_world_info_full"("p_world_info_id" "uuid") IS 'Fetch full world info with entries, tags, creator and interaction flags; enforces access rules.';



CREATE OR REPLACE FUNCTION "public"."force_relationship_ready"("p_user_id" "uuid", "p_character_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_state jsonb;
  v_template jsonb;
  v_path jsonb;
  v_active int;
  v_next_order int;
  v_next_threshold numeric;
  v_current_stage_threshold numeric := 0;
  v_score numeric := 0;
  v_span numeric;
  v_needed numeric;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT relationship_goals INTO v_template
  FROM public.character_latent_profiles
  WHERE character_id = p_character_id;

  IF v_template IS NULL
     OR jsonb_typeof(v_template) <> 'object'
     OR COALESCE((v_template->>'enabled')::boolean,false) = false THEN
    RETURN jsonb_build_object('error','template_missing_or_disabled');
  END IF;

  v_path := v_template->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RETURN jsonb_build_object('error','invalid_path');
  END IF;

  SELECT public.evaluate_relationship_progress(p_user_id, p_character_id)
    INTO v_state;

  IF (v_state ? 'skipped') THEN
    RETURN jsonb_build_object('error','evaluation_skipped');
  END IF;

  v_active := COALESCE((v_state->>'active_order')::int,1);
  v_score  := COALESCE((v_state->>'current_score')::numeric,0);
  v_next_order := v_active + 1;

  SELECT (elem->>'threshold')::numeric
    INTO v_next_threshold
  FROM jsonb_array_elements(v_path) elem
  WHERE (elem->>'order')::int = v_next_order;

  IF v_next_threshold IS NULL THEN
    RETURN jsonb_build_object('error','already_final_stage','state',v_state);
  END IF;

  IF v_active > 1 THEN
    SELECT (elem->>'threshold')::numeric
      INTO v_current_stage_threshold
    FROM jsonb_array_elements(v_path) elem
    WHERE (elem->>'order')::int = v_active;
    IF v_current_stage_threshold IS NULL THEN
      v_current_stage_threshold := 0;
    END IF;
  END IF;

  v_span := v_next_threshold - v_current_stage_threshold;
  IF v_span <= 0 THEN
    RETURN jsonb_build_object('error','invalid_threshold_span','state',v_state);
  END IF;

  IF COALESCE((v_state->>'ready_for_next')::boolean,false) = true THEN
    RETURN v_state;
  END IF;

  v_needed := (v_next_threshold - v_current_stage_threshold) - v_score;

  IF v_needed <= 0 THEN
    v_state := jsonb_set(v_state,'{ready_for_next}','true'::jsonb,true);
    UPDATE public.user_character_relationship_progress
      SET state = v_state
    WHERE user_id = p_user_id AND character_id = p_character_id;
    RETURN v_state;
  END IF;

  -- Fill score
  v_score := v_score + v_needed;

  v_state := jsonb_set(v_state,'{current_score}', to_jsonb(v_score), true);
  v_state := jsonb_set(v_state,'{ready_for_next}','true'::jsonb, true);
  v_state := jsonb_set(v_state,'{stage_progress_percent}','1'::jsonb, true);
  v_state := jsonb_set(v_state,'{stage_progress_span}', to_jsonb(v_span), true);
  v_state := jsonb_set(v_state,'{current_stage_threshold}', to_jsonb(v_current_stage_threshold), true);

  UPDATE public.user_character_relationship_progress
    SET state = v_state
  WHERE user_id = p_user_id AND character_id = p_character_id;

  RETURN v_state;
END;
$$;


ALTER FUNCTION "public"."force_relationship_ready"("p_user_id" "uuid", "p_character_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gentle_addon_context_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Only run if addon settings actually changed
  IF OLD.addon_settings IS DISTINCT FROM NEW.addon_settings THEN
    -- Log the change for debugging
    RAISE NOTICE 'Addon settings changed for user % character %', NEW.user_id, NEW.character_id;
    
    -- Clean up only CURRENT context for disabled addons, preserve historical context
    DELETE FROM public.user_chat_context 
    WHERE user_id = NEW.user_id
      AND character_id = NEW.character_id
      AND current_context IS NOT NULL
      AND NOT (
        (context_type = 'mood' AND (NEW.addon_settings->>'moodTracking')::boolean = true) OR
        (context_type = 'clothing' AND (NEW.addon_settings->>'clothingInventory')::boolean = true) OR
        (context_type = 'location' AND (NEW.addon_settings->>'locationTracking')::boolean = true) OR
        (context_type = 'time_weather' AND (NEW.addon_settings->>'timeAndWeather')::boolean = true) OR
        (context_type = 'relationship' AND (NEW.addon_settings->>'relationshipStatus')::boolean = true)
      );
      
    -- Clean up only future message context updates for disabled addons
    DELETE FROM public.message_context 
    WHERE user_id = NEW.user_id
      AND character_id = NEW.character_id
      AND created_at > NOW() - INTERVAL '1 hour'
      AND NOT (
        (context_updates ? 'moodTracking' AND (NEW.addon_settings->>'moodTracking')::boolean = true) OR
        (context_updates ? 'clothingInventory' AND (NEW.addon_settings->>'clothingInventory')::boolean = true) OR
        (context_updates ? 'locationTracking' AND (NEW.addon_settings->>'locationTracking')::boolean = true) OR
        (context_updates ? 'timeAndWeather' AND (NEW.addon_settings->>'timeAndWeather')::boolean = true) OR
        (context_updates ? 'relationshipStatus' AND (NEW.addon_settings->>'relationshipStatus')::boolean = true)
      );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."gentle_addon_context_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_billing_catalog"("p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_plans json;
  v_packs json;
  v_balance integer;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT json_agg(row_to_json(t) ORDER BY t.price_monthly NULLS FIRST)
    INTO v_plans
  FROM (
    SELECT p.id,
           p.name,
           p.price_monthly,
           p.price_yearly,
           p.monthly_credits_allowance,
           p.features,
           p.paypal_subscription_id
    FROM billing.plans p
    WHERE p.is_active
    ORDER BY p.price_monthly NULLS FIRST
  ) t;

  SELECT json_agg(row_to_json(t) ORDER BY t.price_cents)
    INTO v_packs
  FROM (
    SELECT c.id,
           c.name,
           c.price_cents,
           c.credits_granted,
           c.description
    FROM billing.credit_packs c
    WHERE c.is_active
    ORDER BY c.price_cents
  ) t;

  SELECT balance INTO v_balance FROM billing.credits WHERE user_id = p_user_id;

  RETURN json_build_object(
    'plans', coalesce(v_plans, '[]'::json),
    'credit_packs', coalesce(v_packs, '[]'::json),
    'credits_balance', coalesce(v_balance, 0)
  );
END;$$;


ALTER FUNCTION "public"."get_billing_catalog"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_billing_catalog"("p_user_id" "uuid") IS 'Consolidated billing catalog (active plans, credit packs, and current credit balance) without exposing billing schema.';



CREATE OR REPLACE FUNCTION "public"."get_character_stats"("character_id" "uuid") RETURNS TABLE("total_chats" bigint, "total_messages" bigint, "unique_users" bigint, "average_rating" numeric, "total_favorites" bigint, "total_likes" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  can_view boolean;
BEGIN
  SELECT (visibility = 'public' OR creator_id = auth.uid())
  INTO can_view
  FROM public.characters
  WHERE id = character_id;
  IF NOT coalesce(can_view,false) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    COUNT(DISTINCT c.id)::bigint,
    COUNT(m.id)::bigint,
    COUNT(DISTINCT c.user_id)::bigint,
    NULL::numeric,
    (SELECT COUNT(*) FROM public.character_favorites cf WHERE cf.character_id = character_id),
    (SELECT COUNT(*) FROM public.character_likes cl WHERE cl.character_id = character_id)
  FROM public.chats c
  LEFT JOIN public.messages m ON m.chat_id = c.id
  WHERE c.character_id = character_id;
END;
$$;


ALTER FUNCTION "public"."get_character_stats"("character_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_character_stats"("character_id" "uuid") IS 'Public stats; visibility or ownership enforced inside (SECURITY DEFINER).';



CREATE OR REPLACE FUNCTION "public"."get_chat_context"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid") RETURNS TABLE("current_context" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  -- Enforce caller owns the chat (ignore provided p_user_id to prevent spoof)
  RETURN QUERY
  SELECT cc.current_context
  FROM public.chat_context cc
  JOIN public.chats c ON c.id = cc.chat_id
  WHERE cc.chat_id = p_chat_id
    AND cc.character_id = p_character_id
    AND c.user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_chat_context"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_messages"("p_chat_id" "uuid", "p_limit" integer DEFAULT 30, "p_before_order" bigint DEFAULT NULL::bigint) RETURNS TABLE("id" "uuid", "chat_id" "uuid", "author_id" "uuid", "is_ai_message" boolean, "content" "text", "created_at" timestamp with time zone, "message_order" bigint, "current_context" "jsonb", "context_updates" "jsonb", "has_more" boolean)
    LANGUAGE "sql"
    AS $$
  with base as (
    select m.id,
           m.chat_id,
           m.author_id,
           m.is_ai_message,
           m.content,
           m.created_at,
           m.message_order,
           cc.current_context,
           null::jsonb as context_updates
    from public.messages m
    join public.chats c on c.id = m.chat_id and c.user_id = auth.uid()
    left join public.chat_context cc on cc.chat_id = m.chat_id
    where m.chat_id = p_chat_id
      and (p_before_order is null or m.message_order < p_before_order)
    order by m.message_order desc
    limit least(greatest(p_limit,1), 100)
  )
  select b.id,
         b.chat_id,
         b.author_id,
         b.is_ai_message,
         b.content,
         b.created_at,
         b.message_order,
         b.current_context,
         b.context_updates,
         exists (
           select 1 from public.messages m2
           join public.chats c2 on c2.id = m2.chat_id and c2.user_id = auth.uid()
           where m2.chat_id = p_chat_id
             and m2.message_order < (select min(message_order) from base)
         ) as has_more
  from base b
  order by b.message_order desc;
$$;


ALTER FUNCTION "public"."get_chat_messages"("p_chat_id" "uuid", "p_limit" integer, "p_before_order" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_snapshot"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid", "p_limit" integer DEFAULT 25, "p_before_order" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_context jsonb;
  v_mode text;
  v_last_summary int;
  v_ai_after int;
  v_messages jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_effective_limit int;
BEGIN
  -- Ownership / RLS guard
  PERFORM public._assert_self(p_user_id);

  IF p_chat_id IS NULL OR p_user_id IS NULL OR p_character_id IS NULL THEN
    RAISE EXCEPTION 'Missing required parameters';
  END IF;

  v_effective_limit := LEAST(GREATEST(coalesce(p_limit,25),1),100);

  -- Verify chat belongs to user (prevents leakage even if RLS misconfigured)
  IF NOT EXISTS (SELECT 1 FROM chats WHERE id = p_chat_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Chat not found or access denied';
  END IF;

  -- Chat mode
  SELECT chat_mode INTO v_mode FROM chats WHERE id = p_chat_id;

  -- Context row (already filtered by user & character)
  SELECT current_context::jsonb INTO v_context
    FROM chat_context
   WHERE chat_id = p_chat_id
     AND user_id = p_user_id
     AND character_id = p_character_id;

  -- Latest auto summary message_count
  SELECT message_count INTO v_last_summary
    FROM character_memories
   WHERE chat_id = p_chat_id
     AND is_auto_summary = true
   ORDER BY message_count DESC
   LIMIT 1;

  -- Messages page (DESC by message_order for infinite backward pagination)
  WITH ordered AS (
    SELECT id,
           content,
           is_ai_message,
           created_at,
           message_order,
           current_context
      FROM messages
     WHERE chat_id = p_chat_id
       AND (p_before_order IS NULL OR message_order < p_before_order)
     ORDER BY message_order DESC
     LIMIT v_effective_limit + 1
  ), limited AS (
    SELECT * FROM ordered LIMIT v_effective_limit
  )
  SELECT jsonb_agg(to_jsonb(limited) ORDER BY message_order DESC) INTO v_messages FROM limited;

  -- Has more (if we fetched > limit)
  SELECT (COUNT(*) > v_effective_limit) INTO v_has_more FROM ordered;

  -- AI messages after last summary (excluding placeholders)
  SELECT COUNT(*) INTO v_ai_after
    FROM messages m
   WHERE m.chat_id = p_chat_id
     AND m.is_ai_message IS TRUE
     AND (v_last_summary IS NULL OR m.message_order > v_last_summary)
     AND m.content IS NOT NULL
     AND m.content NOT LIKE '%[PLACEHOLDER]%';

  RETURN jsonb_build_object(
    'chat_id', p_chat_id,
    'chat_mode', v_mode,
    'current_context', coalesce(v_context, '{}'::jsonb),
    'messages', coalesce(v_messages, '[]'::jsonb),
    'has_more', coalesce(v_has_more,false),
    'last_summary_at', coalesce(v_last_summary,0),
    'ai_messages_after_summary', coalesce(v_ai_after,0),
    'page_limit', v_effective_limit,
    'before_order', p_before_order
  );
END;
$$;


ALTER FUNCTION "public"."get_chat_snapshot"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid", "p_limit" integer, "p_before_order" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_chat_snapshot"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid", "p_limit" integer, "p_before_order" integer) IS 'Return consolidated chat snapshot (messages page, context, mode, summary stats) enforcing ownership.';



CREATE OR REPLACE FUNCTION "public"."get_credit_history"("p_user_id" "uuid", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "change_amount" integer, "balance_after" integer, "transaction_type" "text", "description" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  RETURN QUERY
  WITH ordered AS (
    SELECT cl.*,
           SUM(cl.change_amount) OVER (
             PARTITION BY cl.user_id
             ORDER BY cl.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS running_balance
    FROM billing.credit_ledger cl
    WHERE cl.user_id = p_user_id
  )
  SELECT id, change_amount, running_balance, transaction_type, description, created_at
  FROM ordered
  ORDER BY id DESC
  LIMIT GREATEST(p_limit,1)
  OFFSET GREATEST(p_offset,0);
END;
$$;


ALTER FUNCTION "public"."get_credit_history"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_character_cards"("p_search" "text" DEFAULT NULL::"text", "p_sort" "text" DEFAULT 'popular'::"text", "p_tag_ids" integer[] DEFAULT NULL::integer[], "p_creator_username" "text" DEFAULT NULL::"text", "p_include_nsfw" boolean DEFAULT true, "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "short_description" "text", "avatar_url" "text", "interaction_count" integer, "created_at" timestamp with time zone, "creator_id" "uuid", "likes_count" integer, "favorites_count" integer, "chats_count" integer, "creator" "jsonb", "tags" "jsonb"[], "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  with params as (
    select 
      nullif(trim(p_search), '') as q,
      case when p_limit between 1 and 100 then p_limit else 20 end as q_limit,
      case when p_offset >= 0 then p_offset else 0 end as q_offset,
      lower(p_sort) as sort_key
  ), base as (
    select c.id,
           c.name,
           c.short_description,
           c.avatar_url,
           c.interaction_count,
           c.created_at,
           c.creator_id,
           c.likes_count,
           c.favorites_count,
           c.chats_count,
           jsonb_build_object(
             'id', prof.id,
             'username', prof.username,
             'avatar_url', prof.avatar_url
           ) as creator,
           (
             select coalesce(array_agg(distinct jsonb_build_object('id', t.id, 'name', t.name)) filter (where t.id is not null), '{}')
             from character_tags ct
             join tags t on t.id = ct.tag_id
             where ct.character_id = c.id
           ) as tags
    from characters c
    join public_profiles prof on prof.id = c.creator_id
    cross join params p
    where c.visibility = 'public'
      and (
        p.q is null
        or (c.name ilike '%' || p.q || '%'
            or c.short_description ilike '%' || p.q || '%')
      )
      and (
        p_creator_username is null
        or prof.username ilike '%' || p_creator_username || '%'
      )
      and (
        p_include_nsfw
        or not exists (
          select 1 from character_tags nsfw
          where nsfw.character_id = c.id and nsfw.tag_id = 24
        )
      )
      and (
        p_tag_ids is null
        or exists (
          select 1 from character_tags f
          where f.character_id = c.id and f.tag_id = any(p_tag_ids)
        )
      )
  ), ordered as (
    select b.*, count(*) over() as total_count,
      row_number() over(
        order by
          case when (select sort_key from params) = 'newest' then b.created_at end desc,
          case when (select sort_key from params) = 'conversations' then b.chats_count end desc,
          case when (select sort_key from params) not in ('newest','conversations') then b.interaction_count end desc,
          b.id
      ) as rn
    from base b
  )
  select id, name, short_description, avatar_url, interaction_count, created_at, creator_id,
         likes_count, favorites_count, chats_count, creator, tags, total_count
  from ordered o
  cross join params p
  where o.rn > p.q_offset and o.rn <= p.q_offset + p.q_limit
  order by o.rn;
$$;


ALTER FUNCTION "public"."get_public_character_cards"("p_search" "text", "p_sort" "text", "p_tag_ids" integer[], "p_creator_username" "text", "p_include_nsfw" boolean, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_public_character_cards"("p_search" "text", "p_sort" "text", "p_tag_ids" integer[], "p_creator_username" "text", "p_include_nsfw" boolean, "p_limit" integer, "p_offset" integer) IS 'Unified public character listing/search with sorting, tag filter, creator filter, NSFW exclusion, pagination.';



CREATE OR REPLACE FUNCTION "public"."get_public_profile_overview"("p_target_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_profile jsonb;
  v_counts jsonb;
BEGIN
  SELECT to_jsonb(sub) INTO v_profile FROM (
    SELECT id, username, avatar_url, bio, created_at
      FROM public_profiles
     WHERE id = p_target_user_id
  ) sub;

  SELECT jsonb_build_object(
           'chats',      COALESCE((SELECT count(*) FROM chats WHERE user_id = p_target_user_id),0),
           'characters', COALESCE((SELECT count(*) FROM characters WHERE creator_id = p_target_user_id),0),
           'favorites',  COALESCE((SELECT count(*) FROM character_favorites WHERE user_id = p_target_user_id),0),
           'personas',   0
         )
    INTO v_counts;

  RETURN json_build_object(
    'profile', v_profile,
    'counts',  v_counts
  );
END;
$$;


ALTER FUNCTION "public"."get_public_profile_overview"("p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_billing_overview"("p_user_id" "uuid", "p_purchases_limit" integer DEFAULT 25) RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_subscription json;
  v_balance integer;
  v_purchases json;
  v_plans json;
  v_credit_packs json;
  v_models json;
BEGIN
  PERFORM public._assert_self(p_user_id);

  -- Latest active/non-cancelled subscription (if any)
  SELECT json_build_object(
           'id', s.id,
           'status', s.status,
           'current_period_end', s.current_period_end,
           'paypal_subscription_id', s.paypal_subscription_id,
           'plan', json_build_object(
             'id', p.id,
             'name', p.name,
             'monthly_credits_allowance', p.monthly_credits_allowance,
             'price_monthly', p.price_monthly,
             'price_yearly', p.price_yearly
           )
         )
    INTO v_subscription
  FROM billing.subscriptions s
  JOIN billing.plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Credit balance
  SELECT balance INTO v_balance FROM billing.credits WHERE user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);

  -- Recent credit pack purchases (limit)
  SELECT json_agg(
           json_build_object(
             'id', cpp.id,
             'created_at', cpp.created_at,
             'status', cpp.status,
             'credits_granted', cpp.credits_granted,
             'amount_paid_cents', cpp.amount_paid_cents,
             'paypal_order_id', cpp.paypal_order_id,
             'credit_pack', json_build_object(
               'id', cp.id,
               'name', cp.name,
               'credits_granted', cp.credits_granted,
               'price_cents', cp.price_cents,
               'description', cp.description
             )
           ) ORDER BY cpp.created_at DESC
         )
    INTO v_purchases
  FROM (
    SELECT *
    FROM billing.credit_pack_purchases
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT GREATEST(p_purchases_limit,1)
  ) cpp
  JOIN billing.credit_packs cp ON cp.id = cpp.credit_pack_id;

  -- Active subscription plans
  SELECT json_agg(row_to_json(t) ORDER BY t.price_monthly NULLS FIRST)
    INTO v_plans
  FROM (
    SELECT p.id,
           p.name,
           p.price_monthly,
           p.price_yearly,
           p.monthly_credits_allowance,
           p.features,
           p.paypal_subscription_id
    FROM billing.plans p
    WHERE p.is_active
    ORDER BY p.price_monthly NULLS FIRST
  ) t;

  -- Active credit packs
  SELECT json_agg(row_to_json(t) ORDER BY t.price_cents)
    INTO v_credit_packs
  FROM (
    SELECT c.id,
           c.name,
           c.price_cents,
           c.credits_granted,
           c.description
    FROM billing.credit_packs c
    WHERE c.is_active
    ORDER BY c.price_cents
  ) t;

  -- Models with their minimum-priced active plan (if any)
  SELECT json_agg(
           json_build_object(
             'id', m.id,
             'name', m.name,
             'provider_model_id', m.provider_model_id,
             'min_plan', (
               SELECT row_to_json(p2) FROM (
                 SELECT p3.id,
                        p3.name,
                        p3.price_monthly,
                        p3.price_yearly,
                        p3.monthly_credits_allowance
                 FROM billing.plans p3
                 WHERE p3.model_id = m.id AND p3.is_active
                 ORDER BY p3.price_monthly ASC NULLS LAST
                 LIMIT 1
               ) p2
             )
           )
         )
    INTO v_models
  FROM billing.models m;

  RETURN json_build_object(
    'subscription', v_subscription,
    'credits', v_balance,
    'purchases', COALESCE(v_purchases, '[]'::json),
    'plans', COALESCE(v_plans, '[]'::json),
    'credit_packs', COALESCE(v_credit_packs, '[]'::json),
    'models', COALESCE(v_models, '[]'::json)
  );
END;$$;


ALTER FUNCTION "public"."get_user_billing_overview"("p_user_id" "uuid", "p_purchases_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_billing_overview"("p_user_id" "uuid", "p_purchases_limit" integer) IS 'Consolidated user billing overview (subscription, credits, purchases, active plans, credit packs, models w/ min plan). Enforces ownership via public._assert_self.';



CREATE OR REPLACE FUNCTION "public"."get_user_bootstrap"("p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_profile record;
  v_subscription record;
  v_credits integer := 0;
  v_counts jsonb;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT id, username, avatar_url, banner_url, bio, onboarding_completed, created_at, timezone, default_persona_id
    INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  SELECT s.id, s.plan_id, s.status, s.created_at, s.current_period_end,
         p.name AS plan_name, p.monthly_credits_allowance
    INTO v_subscription
  FROM billing.subscriptions s
  JOIN billing.plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT balance INTO v_credits FROM billing.credits WHERE user_id = p_user_id;

  SELECT jsonb_build_object(
           'chats',      COALESCE((SELECT count(*) FROM chats WHERE user_id = p_user_id),0),
           'characters', COALESCE((SELECT count(*) FROM characters WHERE creator_id = p_user_id),0),
           'favorites',  COALESCE((SELECT count(*) FROM character_favorites WHERE user_id = p_user_id),0),
           'personas',   COALESCE((SELECT count(*) FROM personas WHERE user_id = p_user_id),0)
         )
    INTO v_counts;

  RETURN json_build_object(
    'profile',      CASE WHEN v_profile IS NOT NULL THEN to_jsonb(v_profile) ELSE NULL END,
    'subscription', CASE WHEN v_subscription IS NOT NULL THEN to_jsonb(v_subscription) ELSE NULL END,
    'credits',      COALESCE(v_credits,0),
    'counts',       v_counts
  );
END;
$$;


ALTER FUNCTION "public"."get_user_bootstrap"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_chats"("p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("chat_id" "uuid", "character_id" "uuid", "chat_created_at" timestamp with time zone, "chat_updated_at" timestamp with time zone, "character_name" "text", "character_avatar_url" "text", "last_message_id" "uuid", "last_message_created_at" timestamp with time zone, "last_message_is_ai" boolean, "last_message_content" "text", "message_count" bigint, "total_count" bigint)
    LANGUAGE "sql"
    AS $$
  select
    c.id as chat_id,
    c.character_id,
    c.created_at as chat_created_at,
    c.updated_at as chat_updated_at,
    ch.name as character_name,
    ch.avatar_url as character_avatar_url,
    lm.id as last_message_id,
    lm.created_at as last_message_created_at,
    lm.is_ai_message as last_message_is_ai,
    lm.content as last_message_content,
    mc.message_count,
    count(*) over() as total_count
  from public.chats c
  left join public.characters ch on ch.id = c.character_id
  left join lateral (
    select m.id, m.created_at, m.is_ai_message, m.content
    from public.messages m
    where m.chat_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::bigint as message_count
    from public.messages m2
    where m2.chat_id = c.id
  ) mc on true
  where c.user_id = auth.uid()
  order by c.updated_at desc
  limit greatest(p_limit,0) offset greatest(p_offset,0);
$$;


ALTER FUNCTION "public"."get_user_chats"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_credit_purchases"("p_user_id" "uuid", "p_limit" integer DEFAULT 10) RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', cpp.id,
        'created_at', cpp.created_at,
        'status', cpp.status,
        'credits_granted', cpp.credits_granted,
        'amount_paid_cents', cpp.amount_paid_cents,
        'paypal_order_id', cpp.paypal_order_id,
        'credit_pack', json_build_object(
          'id', cp.id,
          'name', cp.name,
          'credits_granted', cp.credits_granted,
          'price_cents', cp.price_cents
        )
      ) ORDER BY cpp.created_at DESC
    )
    FROM (
      SELECT *
      FROM billing.credit_pack_purchases
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      LIMIT GREATEST(p_limit,1)
    ) cpp
    JOIN billing.credit_packs cp ON cp.id = cpp.credit_pack_id
  );
END;
$$;


ALTER FUNCTION "public"."get_user_credit_purchases"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_credits"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE v_balance integer;
BEGIN
  PERFORM public._assert_self(p_user_id);
  SELECT balance INTO v_balance FROM billing.credits WHERE user_id = p_user_id;
  RETURN COALESCE(v_balance,0);
END;
$$;


ALTER FUNCTION "public"."get_user_credits"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_dashboard_overview"("p_user_id" "uuid", "p_chars_limit" integer DEFAULT 30, "p_favs_limit" integer DEFAULT 30) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_chars jsonb := '[]'::jsonb;
  v_favs jsonb := '[]'::jsonb;
  v_liked_ids jsonb := '[]'::jsonb;
  v_counts jsonb;
BEGIN
  PERFORM public._assert_self(p_user_id);

  WITH user_chars AS (
    SELECT c.id, c.name, c.avatar_url, c.visibility, c.likes_count, c.chats_count, c.tagline, c.updated_at
    FROM characters c
    WHERE c.creator_id = p_user_id
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT GREATEST(p_chars_limit, 0)
  ), fav_ids AS (
    SELECT cf.character_id, cf.created_at
    FROM character_favorites cf
    WHERE cf.user_id = p_user_id
    ORDER BY cf.created_at DESC
    LIMIT GREATEST(p_favs_limit, 0)
  ), fav_chars AS (
    SELECT c.id, c.name, c.avatar_url, c.visibility, c.likes_count, c.chats_count, c.tagline, f.created_at AS favorited_at
    FROM characters c
    JOIN fav_ids f ON f.character_id = c.id
    WHERE c.visibility = 'public'
  ), liked AS (
    SELECT cl.character_id
    FROM character_likes cl
    WHERE cl.user_id = p_user_id
      AND cl.character_id IN (
        SELECT id FROM user_chars
        UNION
        SELECT id FROM fav_chars
      )
  )
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(u.*)) FROM user_chars u), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(f.*)) FROM fav_chars f), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(l.character_id)) FROM liked l), '[]'::jsonb)
  INTO v_chars, v_favs, v_liked_ids;

  SELECT jsonb_build_object(
           'characters', (SELECT count(*) FROM characters WHERE creator_id = p_user_id),
           'favorites',  (SELECT count(*) FROM character_favorites WHERE user_id = p_user_id),
           'chats',      (SELECT count(*) FROM chats WHERE user_id = p_user_id)
         ) INTO v_counts;

  RETURN json_build_object(
    'characters', v_chars,
    'favorites', v_favs,
    'liked_ids', v_liked_ids,
    'counts', v_counts
  );
END;
$$;


ALTER FUNCTION "public"."get_user_dashboard_overview"("p_user_id" "uuid", "p_chars_limit" integer, "p_favs_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_persona_context"("p_user_id" "uuid" DEFAULT "auth"."uid"(), "p_chat_id" "uuid" DEFAULT NULL::"uuid", "p_include_list" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_default_persona uuid;
  v_last_used_persona uuid;
  v_first_persona uuid;
  v_chat_persona_row record;
  v_chat_persona jsonb := null;
  v_personas jsonb := null; -- remain null unless requested
begin
  -- Explicit ownership check (defense-in-depth beyond RLS)
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: cannot access persona context for another user';
  end if;

  -- Default persona from profile
  select default_persona_id into v_default_persona
  from public.profiles
  where id = p_user_id;

  -- Last used persona: most recently updated chat with a non-null selected_persona_id
  select c.selected_persona_id into v_last_used_persona
  from public.chats c
  where c.user_id = p_user_id
    and c.selected_persona_id is not null
  order by c.updated_at desc
  limit 1;

  -- First persona created (chronological)
  select p.id into v_first_persona
  from public.personas p
  where p.user_id = p_user_id
  order by p.created_at asc
  limit 1;

  -- Chat selected persona (if chat provided & belongs to user)
  if p_chat_id is not null then
    select pr.id, pr.name, pr.bio, pr.lore, pr.avatar_url
    into v_chat_persona_row
    from public.chats c
    left join public.personas pr on pr.id = c.selected_persona_id
    where c.id = p_chat_id
      and c.user_id = p_user_id
    limit 1;

    if found and v_chat_persona_row.id is not null then
      v_chat_persona := to_jsonb(v_chat_persona_row);
    end if;
  end if;

  -- Personas list (optional, ordered newest first for UI convenience)
  if p_include_list then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'bio', p.bio,
      'lore', p.lore,
      'avatar_url', p.avatar_url,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) order by p.created_at desc), '[]'::jsonb)
    into v_personas
    from public.personas p
    where p.user_id = p_user_id;
  end if;

  return json_build_object(
    'default_persona_id', v_default_persona,
    'last_used_persona_id', v_last_used_persona,
    'first_persona_id', v_first_persona,
    'chat_selected_persona', v_chat_persona,
    'personas', v_personas
  );
end;$$;


ALTER FUNCTION "public"."get_user_persona_context"("p_user_id" "uuid", "p_chat_id" "uuid", "p_include_list" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_persona_context"("p_user_id" "uuid", "p_chat_id" "uuid", "p_include_list" boolean) IS 'Consolidated persona context for the authenticated user: default, last used, first, optional chat selection, optional full list.';



CREATE OR REPLACE FUNCTION "public"."get_user_subscription_with_plan"("p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE v record;
BEGIN
  PERFORM public._assert_self(p_user_id);
  SELECT s.id, s.status, s.current_period_end, s.plan_id,
         p.name, p.monthly_credits_allowance, p.price_monthly, p.price_yearly
    INTO v
  FROM billing.subscriptions s
  JOIN billing.plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN json_build_object(
    'id', v.id,
    'status', v.status,
    'current_period_end', v.current_period_end,
    'plan', json_build_object(
      'id', v.plan_id,
      'name', v.name,
      'monthly_credits_allowance', v.monthly_credits_allowance,
      'price_monthly', v.price_monthly,
      'price_yearly', v.price_yearly
    )
  );
END;
$$;


ALTER FUNCTION "public"."get_user_subscription_with_plan"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_monthly_allowances"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT s.user_id,
           s.id AS subscription_id,
           p.monthly_credits_allowance
    FROM billing.subscriptions s
    JOIN billing.plans p ON p.id = s.plan_id
    WHERE s.status = 'active'
      AND s.current_period_end <= now()
    FOR UPDATE
  LOOP
    UPDATE billing.subscriptions
      SET current_period_end = now() + interval '30 days'
      WHERE id = r.subscription_id;

    IF r.monthly_credits_allowance > 0 THEN
      PERFORM public.add_user_credits(
        r.user_id,
        r.monthly_credits_allowance,
        'subscription_allowance',
        NULL
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."grant_monthly_allowances"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."grant_monthly_allowances"() IS 'Grant monthly plan allowances to subscriptions whose period ended; returns count processed.';



CREATE OR REPLACE FUNCTION "public"."handle_new_user_global_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Insert a row for the new user with default values (defaults enforce OFF)
  INSERT INTO public.user_global_chat_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_global_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_world_info_interaction_count"("world_info_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE world_infos
  SET interaction_count = COALESCE(interaction_count,0)+1
  WHERE id = world_info_id;
END;
$$;


ALTER FUNCTION "public"."increment_world_info_interaction_count"("world_info_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_public_world_infos"("p_search" "text" DEFAULT NULL::"text", "p_sort" "text" DEFAULT 'interactions'::"text", "p_offset" integer DEFAULT 0, "p_limit" integer DEFAULT 20, "p_exclude_nsfw" boolean DEFAULT false, "p_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_items jsonb;
  v_total int;
BEGIN
  WITH base AS (
    SELECT wi.*
    FROM world_infos wi
    WHERE wi.visibility = 'public'
      AND (p_search IS NULL OR trim(p_search) = '' OR (
        wi.name ILIKE '%' || replace(p_search, '%','') || '%' OR
        wi.short_description ILIKE '%' || replace(p_search, '%','') || '%'
      ))
  ), nsfw_filtered AS (
    SELECT b.* FROM base b
    WHERE NOT p_exclude_nsfw OR NOT EXISTS (
      SELECT 1 FROM world_info_tags wit
      WHERE wit.world_info_id = b.id AND wit.tag_id = 24 -- NSFW tag id
    )
  ), tag_filtered AS (
    SELECT n.* FROM nsfw_filtered n
    WHERE p_tag_ids IS NULL OR NOT EXISTS (
      -- ensure every tag in p_tag_ids is present
      SELECT 1 FROM (
        SELECT UNNEST(p_tag_ids) AS tid
      ) req
      WHERE NOT EXISTS (
        SELECT 1 FROM world_info_tags wit
        WHERE wit.world_info_id = n.id AND wit.tag_id = req.tid
      )
    )
  ), ranked AS (
    SELECT
      tf.id,
      tf.name,
      tf.short_description,
      tf.creator_id,
      tf.likes_count,
      tf.interaction_count,
      tf.created_at,
      tf.updated_at,
      tf.visibility,
      (SELECT jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url)
         FROM profiles p WHERE p.id = tf.creator_id) AS creator,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name) ORDER BY tg.name), '[]'::jsonb)
         FROM world_info_tags wit JOIN tags tg ON tg.id = wit.tag_id
         WHERE wit.world_info_id = tf.id) AS tags
    FROM tag_filtered tf
  ), ordered AS (
    SELECT * FROM ranked
    ORDER BY CASE WHEN p_sort = 'newest' THEN created_at END DESC,
             CASE WHEN p_sort <> 'newest' THEN interaction_count END DESC,
             id
    OFFSET GREATEST(p_offset,0) LIMIT LEAST(p_limit,100)
  ), agg AS (
    SELECT
      jsonb_agg(jsonb_build_object(
         'id', o.id,
         'name', o.name,
         'short_description', o.short_description,
         'creator_id', o.creator_id,
         'likes_count', o.likes_count,
         'interaction_count', o.interaction_count,
         'created_at', o.created_at,
         'updated_at', o.updated_at,
         'visibility', o.visibility,
         'creator', o.creator,
         'tags', o.tags
       )) AS items,
      (SELECT COUNT(*) FROM tag_filtered) AS total
    FROM ordered o
  )
  SELECT items, total INTO v_items, v_total FROM agg;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total
  );
END;
$$;


ALTER FUNCTION "public"."list_public_world_infos"("p_search" "text", "p_sort" "text", "p_offset" integer, "p_limit" integer, "p_exclude_nsfw" boolean, "p_tag_ids" integer[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."list_public_world_infos"("p_search" "text", "p_sort" "text", "p_offset" integer, "p_limit" integer, "p_exclude_nsfw" boolean, "p_tag_ids" integer[]) IS 'List public world infos with filtering, sorting, pagination, and tag/NSFW filters.';



CREATE OR REPLACE FUNCTION "public"."list_user_world_infos"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH owned AS (
    SELECT wi.* FROM world_infos wi WHERE wi.creator_id = v_auth
  ),
  collected AS (
    SELECT wi.*
    FROM world_info_users wu
    JOIN world_infos wi ON wi.id = wu.world_info_id
    WHERE wu.user_id = v_auth
  ),
  unioned AS (
    SELECT * FROM owned
    UNION
    SELECT * FROM collected
  ),
  enriched AS (
    SELECT
      u.id,
      u.name,
      u.short_description,
      u.creator_id,
      u.visibility,
      u.likes_count,
      u.interaction_count,
      u.created_at,
      u.updated_at,
      (SELECT COUNT(*) FROM world_info_entries we WHERE we.world_info_id = u.id) AS entries_count,
      (
        SELECT COALESCE(
                 jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name) ORDER BY tg.name),
                 '[]'::jsonb
               )
        FROM world_info_tags wit
        JOIN tags tg ON tg.id = wit.tag_id
        WHERE wit.world_info_id = u.id
      ) AS tags,
      (
        SELECT jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url)
        FROM profiles p
        WHERE p.id = u.creator_id
      ) AS creator
    FROM unioned u
  ),
  ordered AS (
    SELECT * FROM enriched
    ORDER BY updated_at DESC, id
  )
  SELECT jsonb_agg(jsonb_build_object(
           'id', o.id,
           'name', o.name,
           'short_description', o.short_description,
           'creator_id', o.creator_id,
           'visibility', o.visibility,
           'likes_count', o.likes_count,
           'interaction_count', o.interaction_count,
           'entriesCount', COALESCE(o.entries_count,0),
           'created_at', o.created_at,
           'updated_at', o.updated_at,
           'tags', COALESCE(o.tags,'[]'::jsonb),
           'creator', o.creator
         ))
    INTO v_items
  FROM ordered o;

  RETURN COALESCE(v_items, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."list_user_world_infos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_user_world_infos"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_auth IS NULL OR v_auth <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH owned AS (
    SELECT wi.* FROM world_infos wi WHERE wi.creator_id = p_user_id
  ), liked AS (
    SELECT wi.*
    FROM world_info_user_likes wul
    JOIN world_infos wi ON wi.id = wul.world_info_id
    WHERE wul.user_id = p_user_id AND wi.creator_id <> p_user_id
  ), unioned AS (
    SELECT * FROM owned
    UNION
    SELECT * FROM liked
  ), enriched AS (
    SELECT u.id, u.name, u.short_description, u.creator_id, u.visibility,
           u.likes_count, u.interaction_count, u.created_at, u.updated_at,
           (SELECT COUNT(*) FROM world_info_entries we WHERE we.world_info_id = u.id) AS entries_count,
           (SELECT jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name) ORDER BY tg.name)
              FROM world_info_tags wit JOIN tags tg ON tg.id = wit.tag_id
              WHERE wit.world_info_id = u.id) AS tags,
           (SELECT jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) FROM profiles p WHERE p.id = u.creator_id) AS creator
    FROM unioned u
  )
  SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'short_description', e.short_description,
      'creator_id', e.creator_id,
      'visibility', e.visibility,
      'likes_count', e.likes_count,
      'interaction_count', e.interaction_count,
      'entriesCount', COALESCE(e.entries_count,0),
      'created_at', e.created_at,
      'updated_at', e.updated_at,
      'tags', COALESCE(e.tags, '[]'::jsonb),
      'creator', e.creator
    )) INTO v_items
  FROM enriched e;

  RETURN COALESCE(v_items, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."list_user_world_infos"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."list_user_world_infos"("p_user_id" "uuid") IS 'List world infos owned or collected by the authenticated user.';



CREATE OR REPLACE FUNCTION "public"."mark_memories_injected"("mem_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.character_memories
     SET injection_count = COALESCE(injection_count, 0) + 1,
         last_injected_at = now()
   WHERE id = ANY (mem_ids);
$$;


ALTER FUNCTION "public"."mark_memories_injected"("mem_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_new_context_for_disabled_addons"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- This trigger is informational only - it doesn't delete any data
  -- The actual prevention of new context creation happens in the chat edge function
  -- This ensures historical context is NEVER deleted
  
  IF OLD.addon_settings IS DISTINCT FROM NEW.addon_settings THEN
    RAISE NOTICE 'Addon settings changed for user % character % - historical context preserved', NEW.user_id, NEW.character_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_new_context_for_disabled_addons"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provision_billing_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_default_plan uuid;
  v_monthly_allowance integer;
BEGIN
  INSERT INTO billing.credits (user_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id, monthly_credits_allowance
    INTO v_default_plan, v_monthly_allowance
  FROM billing.plans
  WHERE is_active AND lower(name) = 'free'
  LIMIT 1;

  IF v_default_plan IS NOT NULL THEN
    -- Use partial unique index constraint for single active subscription
    INSERT INTO billing.subscriptions (user_id, plan_id, status, current_period_end)
    VALUES (NEW.id, v_default_plan, 'active', now() + interval '30 days')
    ON CONFLICT ON CONSTRAINT billing_subscriptions_active_user_idx DO NOTHING;

    IF v_monthly_allowance IS NOT NULL AND v_monthly_allowance > 0 THEN
      PERFORM public.add_user_credits(NEW.id, v_monthly_allowance, 'subscription_allowance', NULL);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."provision_billing_on_signup"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."provision_billing_on_signup"() IS 'Provision credits row, single active free plan (conflict handled via partial unique index), initial allowance.';



CREATE OR REPLACE FUNCTION "public"."prune_expired_summary_locks"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from public.summary_locks where expires_at < now();
end;$$;


ALTER FUNCTION "public"."prune_expired_summary_locks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_stale_subscription_nonces"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from public.subscription_nonces where created_at < now() - interval '30 minutes';
end;$$;


ALTER FUNCTION "public"."prune_stale_subscription_nonces"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_relationship_signal"("p_user_id" "uuid", "p_character_id" "uuid", "p_kind" "text", "p_weight" numeric, "p_polarity" smallint, "p_source_message_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid; BEGIN
  IF p_user_id <> auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_weight <= 0 THEN RAISE EXCEPTION 'weight must be > 0'; END IF;
  INSERT INTO public.user_character_relationship_signals(user_id, character_id, kind, weight, polarity, source_message_id)
  VALUES (p_user_id, p_character_id, lower(p_kind), p_weight, p_polarity, p_source_message_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;$$;


ALTER FUNCTION "public"."record_relationship_signal"("p_user_id" "uuid", "p_character_id" "uuid", "p_kind" "text", "p_weight" numeric, "p_polarity" smallint, "p_source_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."related_characters"("current_character_id" "uuid", "tag_ids" integer[]) RETURNS TABLE("id" "uuid", "name" "text", "avatar_url" "text", "short_description" "text", "likes_count" integer, "chats_count" integer, "creator" "jsonb", "tags" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
begin
  if tag_ids is null or array_length(tag_ids, 1) is null then
    return query
    select
      c.id,
      c.name,
      c.avatar_url,
      c.short_description,
      c.likes_count,
      c.chats_count,
      jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) as creator,
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
          from (
            select distinct t.id, t.name
            from public.character_tags ct
            join public.tags t on t.id = ct.tag_id
            where ct.character_id = c.id
          ) s
        ), '[]'::jsonb
      ) as tags
    from public.characters c
    left join public.profiles p on p.id = c.creator_id
    where c.visibility = 'public' and c.id <> current_character_id
    order by c.chats_count desc, c.likes_count desc
    limit 10;
  else
    return query
    with related as (
      select ct.character_id, count(*) as overlap
      from public.character_tags ct
      where ct.tag_id = any(tag_ids) and ct.character_id <> current_character_id
      group by ct.character_id
    )
    select
      c.id,
      c.name,
      c.avatar_url,
      c.short_description,
      c.likes_count,
      c.chats_count,
      jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) as creator,
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
          from (
            select distinct t.id, t.name
            from public.character_tags ct2
            join public.tags t on t.id = ct2.tag_id
            where ct2.character_id = c.id
          ) s
        ), '[]'::jsonb
      ) as tags
    from related r
    join public.characters c on c.id = r.character_id
    left join public.profiles p on p.id = c.creator_id
    where c.visibility = 'public'
    order by r.overlap desc, c.chats_count desc, c.likes_count desc
    limit 10;
  end if;
end;$$;


ALTER FUNCTION "public"."related_characters"("current_character_id" "uuid", "tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_tag_names"("p_names" "text"[]) RETURNS TABLE("id" integer, "name" "text")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT t.id, t.name
  FROM public.tags t
  JOIN LATERAL (
    SELECT unnest(p_names) AS qn
  ) q ON lower(t.name) = lower(q.qn)
  ORDER BY t.name;
$$;


ALTER FUNCTION "public"."resolve_tag_names"("p_names" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolve_tag_names"("p_names" "text"[]) IS 'Bulk resolve tag names (case-insensitive) to ids. Uses existing RLS on tags.';



CREATE OR REPLACE FUNCTION "public"."set_ai_sequence_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (NEW.is_ai_message = true) THEN
    SELECT COALESCE(MAX(ai_sequence_number),0) + 1 INTO NEW.ai_sequence_number
      FROM public.messages WHERE chat_id = NEW.chat_id AND is_ai_message = true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_ai_sequence_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_updated_at"() IS 'Unified updated_at trigger function.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at_rel_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."set_updated_at_rel_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_was_public_on_visibility_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If ever set to public, keep was_public true forever
  IF NEW.visibility = 'public' THEN
    NEW.was_public := true;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.was_public, false) = true THEN
    NEW.was_public := true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_was_public_on_visibility_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_characters_chats_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.characters set chats_count = chats_count + 1
    where id = NEW.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters set chats_count = greatest(chats_count - 1, 0)
    where id = OLD.character_id;
  end if;
  return null;
end;$$;


ALTER FUNCTION "public"."tg_characters_chats_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_characters_favorites_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.characters set favorites_count = favorites_count + 1
    where id = NEW.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters set favorites_count = greatest(favorites_count - 1, 0)
    where id = OLD.character_id;
  end if;
  return null;
end;$$;


ALTER FUNCTION "public"."tg_characters_favorites_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_characters_likes_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.characters set likes_count = likes_count + 1
    where id = NEW.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters set likes_count = greatest(likes_count - 1, 0)
    where id = OLD.character_id;
  end if;
  return null;
end;$$;


ALTER FUNCTION "public"."tg_characters_likes_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_characters_messages_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.characters c
    set messages_count = messages_count + 1
    from public.chats ch
    where ch.id = NEW.chat_id and c.id = ch.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters c
    set messages_count = greatest(messages_count - 1, 0)
    from public.chats ch
    where ch.id = OLD.chat_id and c.id = ch.character_id;
  end if;
  return null;
end;$$;


ALTER FUNCTION "public"."tg_characters_messages_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_world_info_like"("p_world_info_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_exists BOOLEAN;
  v_new_count INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if like exists
  SELECT EXISTS(
    SELECT 1 FROM world_info_user_likes 
    WHERE user_id = v_user_id AND world_info_id = p_world_info_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Unlike
    DELETE FROM world_info_user_likes 
    WHERE user_id = v_user_id AND world_info_id = p_world_info_id;
    
    -- Decrement count
    UPDATE world_infos 
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = p_world_info_id
    RETURNING likes_count INTO v_new_count;
    
    RETURN jsonb_build_object('liked', false, 'likes_count', v_new_count);
  ELSE
    -- Like
    INSERT INTO world_info_user_likes (user_id, world_info_id)
    VALUES (v_user_id, p_world_info_id);
    
    -- Increment count
    UPDATE world_infos 
    SET likes_count = likes_count + 1
    WHERE id = p_world_info_id
    RETURNING likes_count INTO v_new_count;
    
    RETURN jsonb_build_object('liked', true, 'likes_count', v_new_count);
  END IF;
END;
$$;


ALTER FUNCTION "public"."toggle_world_info_like"("p_world_info_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_cleanup_disabled_addon_context"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Only run cleanup if addon settings actually changed
  IF OLD.addon_settings IS DISTINCT FROM NEW.addon_settings THEN
    -- Clean up context for this specific user-character combination
    DELETE FROM public.user_chat_context 
    WHERE user_id = NEW.user_id
      AND character_id = NEW.character_id
      AND NOT (
        (context_type = 'mood' AND (NEW.addon_settings->>'moodTracking')::boolean = true) OR
        (context_type = 'clothing' AND (NEW.addon_settings->>'clothingInventory')::boolean = true) OR
        (context_type = 'location' AND (NEW.addon_settings->>'locationTracking')::boolean = true) OR
        (context_type = 'time_weather' AND (NEW.addon_settings->>'timeAndWeather')::boolean = true) OR
        (context_type = 'relationship' AND (NEW.addon_settings->>'relationshipStatus')::boolean = true)
      );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_cleanup_disabled_addon_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_banner_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    IF OLD.banner_url IS DISTINCT FROM NEW.banner_url THEN
        NEW.banner_updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_banner_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_character_latent_profile"("p_character_id" "uuid", "p_profile" "jsonb", "p_source_card_hash" "text", "p_extraction_version" "text", "p_confidence_avg" numeric, "p_populated_domains" smallint, "p_token_cost" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Insert history first (append-only)
  INSERT INTO public.character_latent_profile_history(
    character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost
  ) VALUES (
    p_character_id, p_profile, p_source_card_hash, p_extraction_version, p_confidence_avg, p_populated_domains, p_token_cost
  );

  -- Upsert current state
  INSERT INTO public.character_latent_profiles AS clp(
    character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost
  ) VALUES (
    p_character_id, p_profile, p_source_card_hash, p_extraction_version, p_confidence_avg, p_populated_domains, p_token_cost
  )
  ON CONFLICT (character_id) DO UPDATE SET
    profile = EXCLUDED.profile,
    source_card_hash = EXCLUDED.source_card_hash,
    extraction_version = EXCLUDED.extraction_version,
    confidence_avg = EXCLUDED.confidence_avg,
    populated_domains = EXCLUDED.populated_domains,
    token_cost = EXCLUDED.token_cost,
    updated_at = now();
END;$$;


ALTER FUNCTION "public"."upsert_character_latent_profile"("p_character_id" "uuid", "p_profile" "jsonb", "p_source_card_hash" "text", "p_extraction_version" "text", "p_confidence_avg" numeric, "p_populated_domains" smallint, "p_token_cost" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_relationship_goals"("p_character_id" "uuid", "p_relationship_goals" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_creator uuid;
  v_count int;
  v_path jsonb;
  v_orders int[];
  v_max int;
  v_min int;
  v_existing jsonb;       -- existing relationship_goals (may be null)
  v_version int;
  v_rowcount int;
BEGIN
  IF p_relationship_goals IS NULL THEN
    RAISE EXCEPTION 'relationship_goals payload required';
  END IF;

  SELECT creator_id INTO v_creator FROM public.characters WHERE id = p_character_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'character not found';
  END IF;
  IF v_creator <> auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_path := p_relationship_goals->'path';
  IF jsonb_typeof(v_path) <> 'array' THEN
    RAISE EXCEPTION 'path must be array';
  END IF;
  v_count := jsonb_array_length(v_path);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'at least 2 goals required';
  END IF;
  IF v_count > 10 THEN
    RAISE EXCEPTION 'max 10 goals exceeded';
  END IF;

  SELECT array_agg((elem->>'order')::int ORDER BY (elem->>'order')::int)
    INTO v_orders
  FROM jsonb_array_elements(v_path) elem;

  v_max := (SELECT max(o) FROM unnest(v_orders) o);
  v_min := (SELECT min(o) FROM unnest(v_orders) o);
  IF v_min <> 1 OR v_max <> v_count THEN
    RAISE EXCEPTION 'orders must be contiguous starting at 1';
  END IF;

  -- Lock / check for existing latent profile row
  SELECT relationship_goals INTO v_existing
  FROM public.character_latent_profiles
  WHERE character_id = p_character_id
  FOR UPDATE;  -- if present, lock row
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  -- Determine version
  IF v_rowcount = 0 THEN
    -- No latent profile row yet – initial version baseline
    v_version := COALESCE( (p_relationship_goals->>'version')::int, 1 );
  ELSE
    IF v_existing ? 'version' THEN
      v_version := COALESCE( (p_relationship_goals->>'version')::int, (v_existing->>'version')::int + 1 );
    ELSE
      v_version := COALESCE( (p_relationship_goals->>'version')::int, 1 );
    END IF;
  END IF;

  p_relationship_goals := jsonb_set(p_relationship_goals, '{version}', to_jsonb(v_version), true);
  p_relationship_goals := jsonb_set(p_relationship_goals, '{metadata,updated_at}', to_jsonb(now()), true);
  IF NOT (p_relationship_goals ? 'metadata') THEN
    p_relationship_goals := jsonb_set(p_relationship_goals, '{metadata}', jsonb_build_object('created_at', now(), 'updated_at', now()), true);
  ELSE
    IF NOT (p_relationship_goals #> '{metadata,created_at}' IS NOT NULL) THEN
      p_relationship_goals := jsonb_set(p_relationship_goals, '{metadata,created_at}', to_jsonb(now()), true);
    END IF;
  END IF;

  IF v_rowcount = 0 THEN
    -- Insert stub latent profile row with template
    INSERT INTO public.character_latent_profiles(
      character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost, relationship_goals, created_at, updated_at
    ) VALUES (
      p_character_id, '{}'::jsonb, 'rel_goals_only', 'rel_goals_init', NULL, 0, NULL, p_relationship_goals, now(), now()
    );

    -- History snapshot (initial)
    INSERT INTO public.character_latent_profile_history(
      character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost, relationship_goals, created_at
    ) VALUES (
      p_character_id, '{}'::jsonb, 'rel_goals_only', 'rel_goals_init', NULL, 0, NULL, p_relationship_goals, now()
    );

    RETURN p_relationship_goals;
  END IF;

  -- Existing row: update & snapshot
  UPDATE public.character_latent_profiles
    SET relationship_goals = p_relationship_goals,
        updated_at = now()
    WHERE character_id = p_character_id;

  INSERT INTO public.character_latent_profile_history(
    character_id, profile, source_card_hash, extraction_version, confidence_avg, populated_domains, token_cost, relationship_goals
  )
  SELECT clp.character_id, clp.profile, clp.source_card_hash, clp.extraction_version, clp.confidence_avg, clp.populated_domains, clp.token_cost, p_relationship_goals
  FROM public.character_latent_profiles clp
  WHERE clp.character_id = p_character_id;

  RETURN p_relationship_goals;
END;$$;


ALTER FUNCTION "public"."upsert_relationship_goals"("p_character_id" "uuid", "p_relationship_goals" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_relationship_goals"("p_character_id" "uuid", "p_relationship_goals" "jsonb") IS 'Upserts relationship goals template; inserts latent profile stub if missing.';



CREATE OR REPLACE FUNCTION "public"."upsert_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_paypal_subscription_id" "text" DEFAULT NULL::"text", "p_stripe_subscription_id" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT 'active'::"text", "p_current_period_end" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'billing', 'auth'
    AS $$
DECLARE
  v_active uuid;
  v_id uuid;
  v_status billing.subscription_status;
  v_is_active boolean;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT is_active INTO v_is_active FROM billing.plans WHERE id = p_plan_id;
  IF v_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inactive or invalid plan';
  END IF;

  SELECT CASE lower(p_status)
           WHEN 'active' THEN 'active'
           WHEN 'past_due' THEN 'past_due'
           WHEN 'canceled' THEN 'canceled'
           WHEN 'trialing' THEN 'trialing'
           ELSE NULL
         END::billing.subscription_status
    INTO v_status;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Invalid subscription status: %', p_status;
  END IF;

  SELECT id INTO v_active
  FROM billing.subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_active IS NULL THEN
    INSERT INTO billing.subscriptions(
      user_id, plan_id, status, current_period_end,
      paypal_subscription_id, stripe_subscription_id
    )
    VALUES (
      p_user_id,
      p_plan_id,
      v_status,
      COALESCE(p_current_period_end, now() + interval '30 days'),
      p_paypal_subscription_id,
      p_stripe_subscription_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE billing.subscriptions
       SET plan_id = p_plan_id,
           status = v_status,
           current_period_end = COALESCE(p_current_period_end, current_period_end),
           paypal_subscription_id = COALESCE(p_paypal_subscription_id, paypal_subscription_id),
           stripe_subscription_id = COALESCE(p_stripe_subscription_id, stripe_subscription_id)
     WHERE id = v_active
     RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."upsert_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_paypal_subscription_id" "text", "p_stripe_subscription_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_paypal_subscription_id" "text", "p_stripe_subscription_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone) IS 'Create/update only active subscription; inserts new if none active.';



CREATE OR REPLACE FUNCTION "public"."user_daily_usage_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."user_daily_usage_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_world_infos_list"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH owned AS (
    SELECT wi.id, wi.name, wi.short_description, wi.creator_id, wi.visibility,
           wi.likes_count, wi.interaction_count, wi.created_at, wi.updated_at
    FROM world_infos wi
    WHERE wi.creator_id = v_auth
  ),
  collected AS (
    SELECT wi.id, wi.name, wi.short_description, wi.creator_id, wi.visibility,
           wi.likes_count, wi.interaction_count, wi.created_at, wi.updated_at
    FROM world_info_users wu
    JOIN world_infos wi ON wi.id = wu.world_info_id
    WHERE wu.user_id = v_auth
  ),
  unioned AS (
    SELECT * FROM owned
    UNION
    SELECT * FROM collected
  )
  SELECT jsonb_agg(jsonb_build_object(
           'id', u.id,
           'name', u.name,
           'short_description', u.short_description,
           'creator_id', u.creator_id,
           'visibility', u.visibility,
           'likes_count', u.likes_count,
           'interaction_count', u.interaction_count,
           'created_at', u.created_at,
           'updated_at', u.updated_at
         ))
    INTO v_items
  FROM unioned u;

  RETURN COALESCE(v_items,'[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."user_world_infos_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zz_jsonb_noarg"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$ SELECT jsonb_build_object('ok', true) $$;


ALTER FUNCTION "public"."zz_jsonb_noarg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zz_list_user_world_infos"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$ SELECT '[]'::jsonb $$;


ALTER FUNCTION "public"."zz_list_user_world_infos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zz_test_rpc"() RETURNS "text"
    LANGUAGE "sql"
    AS $$ select 'ok'::text $$;


ALTER FUNCTION "public"."zz_test_rpc"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "auth"."audit_log_entries" (
    "instance_id" "uuid",
    "id" "uuid" NOT NULL,
    "payload" json,
    "created_at" timestamp with time zone,
    "ip_address" character varying(64) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE "auth"."audit_log_entries" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."audit_log_entries" IS 'Auth: Audit trail for user actions.';



CREATE TABLE IF NOT EXISTS "auth"."flow_state" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid",
    "auth_code" "text" NOT NULL,
    "code_challenge_method" "auth"."code_challenge_method" NOT NULL,
    "code_challenge" "text" NOT NULL,
    "provider_type" "text" NOT NULL,
    "provider_access_token" "text",
    "provider_refresh_token" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "authentication_method" "text" NOT NULL,
    "auth_code_issued_at" timestamp with time zone
);


ALTER TABLE "auth"."flow_state" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."flow_state" IS 'stores metadata for pkce logins';



CREATE TABLE IF NOT EXISTS "auth"."identities" (
    "provider_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "identity_data" "jsonb" NOT NULL,
    "provider" "text" NOT NULL,
    "last_sign_in_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "email" "text" GENERATED ALWAYS AS ("lower"(("identity_data" ->> 'email'::"text"))) STORED,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "auth"."identities" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."identities" IS 'Auth: Stores identities associated to a user.';



COMMENT ON COLUMN "auth"."identities"."email" IS 'Auth: Email is a generated column that references the optional email property in the identity_data';



CREATE TABLE IF NOT EXISTS "auth"."instances" (
    "id" "uuid" NOT NULL,
    "uuid" "uuid",
    "raw_base_config" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "auth"."instances" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."instances" IS 'Auth: Manages users across multiple sites.';



CREATE TABLE IF NOT EXISTS "auth"."mfa_amr_claims" (
    "session_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "authentication_method" "text" NOT NULL,
    "id" "uuid" NOT NULL
);


ALTER TABLE "auth"."mfa_amr_claims" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."mfa_amr_claims" IS 'auth: stores authenticator method reference claims for multi factor authentication';



CREATE TABLE IF NOT EXISTS "auth"."mfa_challenges" (
    "id" "uuid" NOT NULL,
    "factor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "verified_at" timestamp with time zone,
    "ip_address" "inet" NOT NULL,
    "otp_code" "text",
    "web_authn_session_data" "jsonb"
);


ALTER TABLE "auth"."mfa_challenges" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."mfa_challenges" IS 'auth: stores metadata about challenge requests made';



CREATE TABLE IF NOT EXISTS "auth"."mfa_factors" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "friendly_name" "text",
    "factor_type" "auth"."factor_type" NOT NULL,
    "status" "auth"."factor_status" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "secret" "text",
    "phone" "text",
    "last_challenged_at" timestamp with time zone,
    "web_authn_credential" "jsonb",
    "web_authn_aaguid" "uuid"
);


ALTER TABLE "auth"."mfa_factors" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."mfa_factors" IS 'auth: stores metadata about factors';



CREATE TABLE IF NOT EXISTS "auth"."one_time_tokens" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_type" "auth"."one_time_token_type" NOT NULL,
    "token_hash" "text" NOT NULL,
    "relates_to" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "one_time_tokens_token_hash_check" CHECK (("char_length"("token_hash") > 0))
);


ALTER TABLE "auth"."one_time_tokens" OWNER TO "supabase_auth_admin";


CREATE TABLE IF NOT EXISTS "auth"."refresh_tokens" (
    "instance_id" "uuid",
    "id" bigint NOT NULL,
    "token" character varying(255),
    "user_id" character varying(255),
    "revoked" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "parent" character varying(255),
    "session_id" "uuid"
);


ALTER TABLE "auth"."refresh_tokens" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."refresh_tokens" IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';



CREATE SEQUENCE IF NOT EXISTS "auth"."refresh_tokens_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "auth"."refresh_tokens_id_seq" OWNER TO "supabase_auth_admin";


ALTER SEQUENCE "auth"."refresh_tokens_id_seq" OWNED BY "auth"."refresh_tokens"."id";



CREATE TABLE IF NOT EXISTS "auth"."saml_providers" (
    "id" "uuid" NOT NULL,
    "sso_provider_id" "uuid" NOT NULL,
    "entity_id" "text" NOT NULL,
    "metadata_xml" "text" NOT NULL,
    "metadata_url" "text",
    "attribute_mapping" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "name_id_format" "text",
    CONSTRAINT "entity_id not empty" CHECK (("char_length"("entity_id") > 0)),
    CONSTRAINT "metadata_url not empty" CHECK ((("metadata_url" = NULL::"text") OR ("char_length"("metadata_url") > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK (("char_length"("metadata_xml") > 0))
);


ALTER TABLE "auth"."saml_providers" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."saml_providers" IS 'Auth: Manages SAML Identity Provider connections.';



CREATE TABLE IF NOT EXISTS "auth"."saml_relay_states" (
    "id" "uuid" NOT NULL,
    "sso_provider_id" "uuid" NOT NULL,
    "request_id" "text" NOT NULL,
    "for_email" "text",
    "redirect_to" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "flow_state_id" "uuid",
    CONSTRAINT "request_id not empty" CHECK (("char_length"("request_id") > 0))
);


ALTER TABLE "auth"."saml_relay_states" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."saml_relay_states" IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';



CREATE TABLE IF NOT EXISTS "auth"."schema_migrations" (
    "version" character varying(255) NOT NULL
);


ALTER TABLE "auth"."schema_migrations" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."schema_migrations" IS 'Auth: Manages updates to the auth system.';



CREATE TABLE IF NOT EXISTS "auth"."sessions" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "factor_id" "uuid",
    "aal" "auth"."aal_level",
    "not_after" timestamp with time zone,
    "refreshed_at" timestamp without time zone,
    "user_agent" "text",
    "ip" "inet",
    "tag" "text"
);


ALTER TABLE "auth"."sessions" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."sessions" IS 'Auth: Stores session data associated to a user.';



COMMENT ON COLUMN "auth"."sessions"."not_after" IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';



CREATE TABLE IF NOT EXISTS "auth"."sso_domains" (
    "id" "uuid" NOT NULL,
    "sso_provider_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK (("char_length"("domain") > 0))
);


ALTER TABLE "auth"."sso_domains" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."sso_domains" IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';



CREATE TABLE IF NOT EXISTS "auth"."sso_providers" (
    "id" "uuid" NOT NULL,
    "resource_id" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    CONSTRAINT "resource_id not empty" CHECK ((("resource_id" = NULL::"text") OR ("char_length"("resource_id") > 0)))
);


ALTER TABLE "auth"."sso_providers" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."sso_providers" IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';



COMMENT ON COLUMN "auth"."sso_providers"."resource_id" IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';



CREATE TABLE IF NOT EXISTS "auth"."users" (
    "instance_id" "uuid",
    "id" "uuid" NOT NULL,
    "aud" character varying(255),
    "role" character varying(255),
    "email" character varying(255),
    "encrypted_password" character varying(255),
    "email_confirmed_at" timestamp with time zone,
    "invited_at" timestamp with time zone,
    "confirmation_token" character varying(255),
    "confirmation_sent_at" timestamp with time zone,
    "recovery_token" character varying(255),
    "recovery_sent_at" timestamp with time zone,
    "email_change_token_new" character varying(255),
    "email_change" character varying(255),
    "email_change_sent_at" timestamp with time zone,
    "last_sign_in_at" timestamp with time zone,
    "raw_app_meta_data" "jsonb",
    "raw_user_meta_data" "jsonb",
    "is_super_admin" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "phone" "text" DEFAULT NULL::character varying,
    "phone_confirmed_at" timestamp with time zone,
    "phone_change" "text" DEFAULT ''::character varying,
    "phone_change_token" character varying(255) DEFAULT ''::character varying,
    "phone_change_sent_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone GENERATED ALWAYS AS (LEAST("email_confirmed_at", "phone_confirmed_at")) STORED,
    "email_change_token_current" character varying(255) DEFAULT ''::character varying,
    "email_change_confirm_status" smallint DEFAULT 0,
    "banned_until" timestamp with time zone,
    "reauthentication_token" character varying(255) DEFAULT ''::character varying,
    "reauthentication_sent_at" timestamp with time zone,
    "is_sso_user" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    CONSTRAINT "users_email_change_confirm_status_check" CHECK ((("email_change_confirm_status" >= 0) AND ("email_change_confirm_status" <= 2)))
);


ALTER TABLE "auth"."users" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."users" IS 'Auth: Stores user login data within a secure schema.';



COMMENT ON COLUMN "auth"."users"."is_sso_user" IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';



CREATE TABLE IF NOT EXISTS "billing"."credit_ledger" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "change_amount" integer NOT NULL,
    "transaction_type" "billing"."credit_transaction_type" NOT NULL,
    "description" "text",
    "related_transaction_id" "uuid",
    "related_message_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "billing"."credit_ledger" OWNER TO "postgres";


COMMENT ON TABLE "billing"."credit_ledger" IS 'Immutable ledger of all credit transactions for auditing.';



CREATE SEQUENCE IF NOT EXISTS "billing"."credit_ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "billing"."credit_ledger_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "billing"."credit_ledger_id_seq" OWNED BY "billing"."credit_ledger"."id";



CREATE TABLE IF NOT EXISTS "billing"."credit_pack_purchases" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "credit_pack_id" "uuid" NOT NULL,
    "paypal_order_id" "text",
    "amount_paid_cents" integer NOT NULL,
    "credits_granted" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_pack_purchases_amount_paid_cents_check" CHECK (("amount_paid_cents" >= 0)),
    CONSTRAINT "credit_pack_purchases_credits_granted_check" CHECK (("credits_granted" > 0)),
    CONSTRAINT "credit_pack_purchases_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "billing"."credit_pack_purchases" OWNER TO "postgres";


COMMENT ON TABLE "billing"."credit_pack_purchases" IS 'Tracks individual user purchases of credit packs.';



CREATE TABLE IF NOT EXISTS "billing"."credit_packs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "price_cents" integer NOT NULL,
    "credits_granted" integer NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_packs_credits_granted_check" CHECK (("credits_granted" > 0)),
    CONSTRAINT "credit_packs_price_cents_check" CHECK (("price_cents" >= 0))
);


ALTER TABLE "billing"."credit_packs" OWNER TO "postgres";


COMMENT ON TABLE "billing"."credit_packs" IS 'One-time purchasable credit bundles (canonical).';



CREATE TABLE IF NOT EXISTS "billing"."credits" (
    "user_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "credits_balance_check" CHECK (("balance" >= 0))
);


ALTER TABLE "billing"."credits" OWNER TO "postgres";


COMMENT ON TABLE "billing"."credits" IS 'Stores the current credit balance for each user.';



CREATE TABLE IF NOT EXISTS "billing"."models" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "provider_model_id" "text" NOT NULL
);


ALTER TABLE "billing"."models" OWNER TO "postgres";


COMMENT ON TABLE "billing"."models" IS 'Stores details and pricing for available AI models.';



CREATE TABLE IF NOT EXISTS "billing"."plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "price_monthly" integer,
    "price_yearly" integer,
    "monthly_credits_allowance" integer DEFAULT 0 NOT NULL,
    "features" "jsonb",
    "stripe_price_id_monthly" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "paypal_subscription_id" "text",
    "model_id" "uuid",
    "stripe_price_id_yearly" "text"
);


ALTER TABLE "billing"."plans" OWNER TO "postgres";


COMMENT ON TABLE "billing"."plans" IS 'Stores subscription plan details and features.';



CREATE TABLE IF NOT EXISTS "billing"."subscriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "billing"."subscription_status" NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "stripe_subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paypal_subscription_id" "text"
);


ALTER TABLE "billing"."subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "billing"."subscriptions" IS 'Tracks user subscriptions and their status.';



CREATE TABLE IF NOT EXISTS "billing"."transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gateway" "billing"."gateway_type" NOT NULL,
    "gateway_transaction_id" "text",
    "amount" integer NOT NULL,
    "currency" "text" NOT NULL,
    "status" "billing"."transaction_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purchase_type" "billing"."transaction_purchase_type",
    "subscription_id" "uuid",
    "credit_pack_purchase_id" "uuid",
    CONSTRAINT "transactions_purchase_type_integrity" CHECK ((("purchase_type" IS NULL) OR ((("purchase_type" = 'subscription'::"billing"."transaction_purchase_type") AND ("subscription_id" IS NOT NULL) AND ("credit_pack_purchase_id" IS NULL)) OR (("purchase_type" = 'credit_pack'::"billing"."transaction_purchase_type") AND ("credit_pack_purchase_id" IS NOT NULL) AND ("subscription_id" IS NULL)))))
);


ALTER TABLE "billing"."transactions" OWNER TO "postgres";


COMMENT ON TABLE "billing"."transactions" IS 'Logs all payment gateway transactions.';



COMMENT ON COLUMN "billing"."transactions"."purchase_type" IS 'Indicates whether the transaction is for a subscription or a credit pack.';



COMMENT ON COLUMN "billing"."transactions"."subscription_id" IS 'FK to billing.subscriptions when purchase_type=subscription';



COMMENT ON COLUMN "billing"."transactions"."credit_pack_purchase_id" IS 'FK to billing.credit_pack_purchases when purchase_type=credit_pack';



CREATE TABLE IF NOT EXISTS "public"."character_definitions" (
    "character_id" "uuid" NOT NULL,
    "greeting" "text",
    "description" "text",
    "personality_summary" "text" NOT NULL,
    "scenario" "jsonb",
    "initial_addon_context_enabled" boolean DEFAULT false NOT NULL,
    "initial_addon_context" "jsonb"
);


ALTER TABLE "public"."character_definitions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."character_definitions"."initial_addon_context_enabled" IS 'Flag indicating custom initial addon context is enabled for this character';



COMMENT ON COLUMN "public"."character_definitions"."initial_addon_context" IS 'JSON object containing manually seeded initial addon context values (mood, clothing, etc)';



CREATE TABLE IF NOT EXISTS "public"."character_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."character_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_latent_profile_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "profile" "jsonb" NOT NULL,
    "source_card_hash" "text" NOT NULL,
    "extraction_version" "text" NOT NULL,
    "confidence_avg" numeric(4,3),
    "populated_domains" smallint NOT NULL,
    "token_cost" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "relationship_goals" "jsonb",
    CONSTRAINT "character_latent_profile_history_populated_domains_check" CHECK ((("populated_domains" >= 0) AND ("populated_domains" <= 20))),
    CONSTRAINT "character_latent_profile_history_profile_shape" CHECK (("jsonb_typeof"("profile") = 'object'::"text")),
    CONSTRAINT "character_latent_profile_history_relationship_goals_shape" CHECK ((("relationship_goals" IS NULL) OR ("jsonb_typeof"("relationship_goals") = 'object'::"text")))
);


ALTER TABLE "public"."character_latent_profile_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_latent_profiles" (
    "character_id" "uuid" NOT NULL,
    "profile" "jsonb" NOT NULL,
    "source_card_hash" "text" NOT NULL,
    "extraction_version" "text" NOT NULL,
    "confidence_avg" numeric(4,3),
    "populated_domains" smallint NOT NULL,
    "token_cost" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "relationship_goals" "jsonb",
    CONSTRAINT "character_latent_profiles_populated_domains_check" CHECK ((("populated_domains" >= 0) AND ("populated_domains" <= 20))),
    CONSTRAINT "character_latent_profiles_profile_shape" CHECK (("jsonb_typeof"("profile") = 'object'::"text")),
    CONSTRAINT "character_latent_profiles_relationship_goals_shape" CHECK ((("relationship_goals" IS NULL) OR ("jsonb_typeof"("relationship_goals") = 'object'::"text")))
);


ALTER TABLE "public"."character_latent_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."character_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "chat_id" "uuid",
    "summary_content" "text" NOT NULL,
    "trigger_keywords" "text"[] NOT NULL,
    "message_count" integer NOT NULL,
    "input_token_cost" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_auto_summary" boolean DEFAULT false,
    "name" "text",
    "last_injected_at" timestamp with time zone,
    "injection_count" integer DEFAULT 0,
    "content_hash" "text",
    "ai_sequence_start" integer,
    "ai_sequence_end" integer,
    "embedding" "public"."vector"(1536),
    CONSTRAINT "character_memories_summary_length_chk" CHECK ((("summary_content" IS NULL) OR ("length"("summary_content") <= 7000))),
    CONSTRAINT "character_memories_trigger_keywords_count_chk" CHECK ((("trigger_keywords" IS NULL) OR ("array_length"("trigger_keywords", 1) <= 15))),
    CONSTRAINT "character_memories_trigger_keywords_item_length_chk" CHECK ((("trigger_keywords" IS NULL) OR "public"."array_all_item_length_lte"("trigger_keywords", 40)))
);


ALTER TABLE "public"."character_memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_tags" (
    "character_id" "uuid" NOT NULL,
    "tag_id" integer NOT NULL
);


ALTER TABLE "public"."character_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_world_info_link" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "world_info_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."character_world_info_link" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."characters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "short_description" "text",
    "avatar_url" "text",
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "interaction_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tagline" "text",
    "likes_count" integer DEFAULT 0 NOT NULL,
    "favorites_count" integer DEFAULT 0 NOT NULL,
    "chats_count" integer DEFAULT 0 NOT NULL,
    "messages_count" integer DEFAULT 0 NOT NULL,
    "was_public" boolean DEFAULT false NOT NULL,
    CONSTRAINT "characters_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'unlisted'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."characters" OWNER TO "postgres";


COMMENT ON COLUMN "public"."characters"."tagline" IS 'Character tagline/title from character creation foundation step';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "bio" "text",
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    "onboarding_survey_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_persona_id" "uuid",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "banner_url" "text",
    "banner_updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."world_infos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "short_description" "text",
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "interaction_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "likes_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "world_infos_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'unlisted'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."world_infos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."character_profile_view" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."name",
    "c"."short_description",
    "c"."avatar_url",
    "c"."visibility",
    "c"."was_public",
    "c"."interaction_count",
    "c"."created_at",
    "c"."updated_at",
    "c"."tagline",
    "c"."creator_id",
    "c"."likes_count",
    "c"."favorites_count",
    "c"."chats_count",
    "c"."messages_count",
    "jsonb_build_object"('greeting', "cd"."greeting", 'description', "cd"."description", 'personality_summary', "cd"."personality_summary", 'scenario', "cd"."scenario") AS "character_definitions",
    "jsonb_build_object"('id', "p"."id", 'username', "p"."username", 'avatar_url', "p"."avatar_url") AS "creator",
    COALESCE(( SELECT "jsonb_agg"("jsonb_build_object"('id', "s"."id", 'name', "s"."name") ORDER BY "s"."name") AS "jsonb_agg"
           FROM ( SELECT DISTINCT "t"."id",
                    "t"."name"
                   FROM ("public"."character_tags" "ct"
                     JOIN "public"."tags" "t" ON (("t"."id" = "ct"."tag_id")))
                  WHERE ("ct"."character_id" = "c"."id")) "s"), '[]'::"jsonb") AS "tags",
    COALESCE(( SELECT "jsonb_agg"("jsonb_build_object"('id', "s"."id", 'name', "s"."name", 'short_description', "s"."short_description") ORDER BY "s"."name") AS "jsonb_agg"
           FROM ( SELECT DISTINCT "w"."id",
                    "w"."name",
                    "w"."short_description"
                   FROM ("public"."character_world_info_link" "cwil"
                     JOIN "public"."world_infos" "w" ON (("w"."id" = "cwil"."world_info_id")))
                  WHERE ("cwil"."character_id" = "c"."id")) "s"), '[]'::"jsonb") AS "world_infos"
   FROM (("public"."characters" "c"
     LEFT JOIN "public"."character_definitions" "cd" ON (("cd"."character_id" = "c"."id")))
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "c"."creator_id")));


ALTER VIEW "public"."character_profile_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "current_context" "jsonb" DEFAULT '{"mood": null, "clothing": null, "location": null, "relationship": null, "time_weather": null, "urgency_level": null, "conversation_tone": null, "character_position": null}'::"jsonb" NOT NULL,
    "last_updated_by_message_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enchantment_status" "text",
    "item_inventory" "text"
);


ALTER TABLE "public"."chat_context" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "title" "text",
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected_persona_id" "uuid",
    "context_ceiling_warned" boolean DEFAULT false,
    "chat_mode" "text" DEFAULT 'storytelling'::"text" NOT NULL,
    CONSTRAINT "chats_chat_mode_check" CHECK (("chat_mode" = ANY (ARRAY['storytelling'::"text", 'companion'::"text"])))
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "is_ai_message" boolean DEFAULT false NOT NULL,
    "content" "text" NOT NULL,
    "token_cost" integer,
    "model_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_context" "jsonb",
    "message_order" integer DEFAULT 1 NOT NULL,
    "is_placeholder" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ai_sequence_number" integer,
    CONSTRAINT "messages_author_id_check" CHECK (((("is_ai_message" = true) AND ("author_id" IS NULL)) OR (("is_ai_message" = false) AND ("author_id" IS NOT NULL))))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_checklist_items" (
    "id" integer NOT NULL,
    "task_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "reward_credits" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."onboarding_checklist_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_checklist_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_checklist_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_checklist_items_id_seq" OWNED BY "public"."onboarding_checklist_items"."id";



CREATE TABLE IF NOT EXISTS "public"."parsed_character_cards" (
    "hash" "text" NOT NULL,
    "vendor" "text",
    "version" "text",
    "normalized" "jsonb" NOT NULL,
    "avatar_public_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parsed_character_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "bio" "text",
    "lore" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_app_settings" (
    "setting_key" "text" NOT NULL,
    "setting_value" "text" NOT NULL
);


ALTER TABLE "public"."public_app_settings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_profiles" AS
 SELECT "id",
    "username",
    "avatar_url",
    "bio",
    "created_at"
   FROM "public"."profiles";


ALTER VIEW "public"."public_profiles" OWNER TO "postgres";


COMMENT ON VIEW "public"."public_profiles" IS 'Safe public projection of profiles (no sensitive/internal columns). Prefer selecting from this view for directory listings.';



CREATE TABLE IF NOT EXISTS "public"."subscription_nonces" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provisional_subscription_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_nonces" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tags_id_seq" OWNED BY "public"."tags"."id";



CREATE TABLE IF NOT EXISTS "public"."user_age_verification" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_age_verification" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_character_relationship_progress" (
    "user_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_character_relationship_progress_state_shape" CHECK (("jsonb_typeof"("state") = 'object'::"text"))
);


ALTER TABLE "public"."user_character_relationship_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_character_relationship_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "weight" numeric(5,3) NOT NULL,
    "polarity" smallint NOT NULL,
    "source_message_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_character_relationship_signals_polarity_check" CHECK (("polarity" = ANY (ARRAY[1, '-1'::integer])))
);


ALTER TABLE "public"."user_character_relationship_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_character_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "chat_mode" "text" DEFAULT 'storytelling'::"text" NOT NULL,
    "time_awareness_enabled" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_character_settings_chat_mode_check" CHECK (("chat_mode" = ANY (ARRAY['storytelling'::"text", 'companion'::"text"])))
);


ALTER TABLE "public"."user_character_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_character_world_info_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "world_info_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_character_world_info_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_global_chat_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dynamic_world_info" boolean DEFAULT false,
    "enhanced_memory" boolean DEFAULT false,
    "mood_tracking" boolean DEFAULT false,
    "clothing_inventory" boolean DEFAULT false,
    "location_tracking" boolean DEFAULT false,
    "time_and_weather" boolean DEFAULT false,
    "relationship_status" boolean DEFAULT false,
    "character_position" boolean DEFAULT false,
    "chain_of_thought" boolean DEFAULT false,
    "few_shot_examples" boolean DEFAULT false,
    "streaming_mode" character varying(20) DEFAULT 'smooth'::character varying,
    "font_size" character varying(10) DEFAULT 'normal'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nsfw_enabled" boolean DEFAULT false,
    "ai_text_color" "text" DEFAULT '#E5E7EB'::"text" NOT NULL,
    "user_text_color" "text" DEFAULT '#FFFFFF'::"text" NOT NULL,
    "show_character_avatar" boolean DEFAULT true NOT NULL,
    "show_user_avatar" boolean DEFAULT false NOT NULL,
    "avatar_shape" "text" DEFAULT 'circle'::"text" NOT NULL,
    "avatar_size" "text" DEFAULT 'md'::"text" NOT NULL,
    "background_image_url" "text",
    "ai_bubble_color" "text" DEFAULT '#1f2937'::"text" NOT NULL,
    "ai_bubble_opacity" numeric DEFAULT 0.9 NOT NULL,
    "user_bubble_color" "text" DEFAULT '#FF7A00'::"text" NOT NULL,
    "user_bubble_opacity" numeric DEFAULT 1 NOT NULL,
    "semantic_overrides_mode" "text" DEFAULT 'default'::"text" NOT NULL,
    "speech_color" "text",
    "action_color" "text",
    "emphasis_color" "text",
    "parenthetical_color" "text",
    "avatar_style" "text" DEFAULT 'classic'::"text" NOT NULL,
    "avatar_overlay_opacity" numeric DEFAULT 0.6,
    "avatar_overlay_color" "text" DEFAULT '#000000'::"text",
    "avatar_blur_nsfw" boolean DEFAULT true,
    "portrait_frame_style" "text" DEFAULT 'clean'::"text",
    "portrait_frame_color" "text" DEFAULT '#4B5563'::"text",
    "banner_width" "text" DEFAULT 'md'::"text",
    "banner_tint_from_avatar" boolean DEFAULT false,
    "god_mode" boolean DEFAULT false NOT NULL,
    "enchantment_status" boolean DEFAULT false,
    "item_inventory" boolean DEFAULT false,
    CONSTRAINT "user_global_chat_settings_ai_bubble_opacity_check" CHECK ((("ai_bubble_opacity" >= (0)::numeric) AND ("ai_bubble_opacity" <= (1)::numeric))),
    CONSTRAINT "user_global_chat_settings_avatar_overlay_opacity_check" CHECK ((("avatar_overlay_opacity" >= (0)::numeric) AND ("avatar_overlay_opacity" <= (1)::numeric))),
    CONSTRAINT "user_global_chat_settings_avatar_shape_check" CHECK (("avatar_shape" = ANY (ARRAY['circle'::"text", 'rounded'::"text"]))),
    CONSTRAINT "user_global_chat_settings_avatar_size_check" CHECK (("avatar_size" = ANY (ARRAY['sm'::"text", 'md'::"text", 'lg'::"text"]))),
    CONSTRAINT "user_global_chat_settings_avatar_style_check" CHECK (("avatar_style" = ANY (ARRAY['classic'::"text", 'bubble-bg'::"text", 'portrait'::"text", 'side-banner'::"text"]))),
    CONSTRAINT "user_global_chat_settings_banner_width_check" CHECK (("banner_width" = ANY (ARRAY['sm'::"text", 'md'::"text", 'lg'::"text"]))),
    CONSTRAINT "user_global_chat_settings_font_size_check" CHECK ((("font_size")::"text" = ANY (ARRAY[('small'::character varying)::"text", ('normal'::character varying)::"text", ('large'::character varying)::"text"]))),
    CONSTRAINT "user_global_chat_settings_portrait_frame_style_check" CHECK (("portrait_frame_style" = ANY (ARRAY['clean'::"text", 'polaroid'::"text", 'foil'::"text"]))),
    CONSTRAINT "user_global_chat_settings_semantic_mode_check" CHECK (("semantic_overrides_mode" = ANY (ARRAY['default'::"text", 'custom'::"text", 'disabled'::"text"]))),
    CONSTRAINT "user_global_chat_settings_streaming_mode_check" CHECK ((("streaming_mode")::"text" = ANY (ARRAY[('instant'::character varying)::"text", ('smooth'::character varying)::"text"]))),
    CONSTRAINT "user_global_chat_settings_user_bubble_opacity_check" CHECK ((("user_bubble_opacity" >= (0)::numeric) AND ("user_bubble_opacity" <= (1)::numeric)))
);


ALTER TABLE "public"."user_global_chat_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_global_chat_settings" IS 'Global chat settings that apply to ALL chats and characters for each user. Includes addon settings, streaming preferences, UI configuration, and accessibility options.';



COMMENT ON COLUMN "public"."user_global_chat_settings"."dynamic_world_info" IS 'Global addon: Enhanced world knowledge for all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."enhanced_memory" IS 'Global addon: Better conversation memory for all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."mood_tracking" IS 'Global addon: Track character emotions in all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."clothing_inventory" IS 'Global addon: Track character outfits in all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."location_tracking" IS 'Global addon: Track current location in all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."time_and_weather" IS 'Global addon: Real-time environment for all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."relationship_status" IS 'Global addon: Track relationships in all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."character_position" IS 'Global addon: Track character physical position in all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."chain_of_thought" IS 'Global addon: Advanced reasoning for all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."few_shot_examples" IS 'Global addon: Better response quality for all chats';



COMMENT ON COLUMN "public"."user_global_chat_settings"."streaming_mode" IS 'Global streaming mode: instant (no streaming), smooth (real-time), adaptive (adjusts based on connection)';



COMMENT ON COLUMN "public"."user_global_chat_settings"."font_size" IS 'Global accessibility setting for message font size preference';



COMMENT ON COLUMN "public"."user_global_chat_settings"."avatar_style" IS 'Avatar display style: classic (normal), bubble-bg (avatar as bubble background), portrait (framed), side-banner (vertical strip)';



CREATE TABLE IF NOT EXISTS "public"."world_info_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "world_info_id" "uuid" NOT NULL,
    "keywords" "text"[] NOT NULL,
    "entry_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "world_info_entries_entry_text_length_chk" CHECK (("length"("entry_text") <= 6000)),
    CONSTRAINT "world_info_entries_keywords_count_chk" CHECK ((("array_length"("keywords", 1) IS NOT NULL) AND ("array_length"("keywords", 1) <= 12))),
    CONSTRAINT "world_info_entries_keywords_item_length_chk" CHECK ("public"."array_all_item_length_lte"("keywords", 40))
);


ALTER TABLE "public"."world_info_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."world_info_tags" (
    "world_info_id" "uuid" NOT NULL,
    "tag_id" integer NOT NULL
);


ALTER TABLE "public"."world_info_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."world_info_user_likes" (
    "user_id" "uuid" NOT NULL,
    "world_info_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."world_info_user_likes" OWNER TO "postgres";


ALTER TABLE ONLY "auth"."refresh_tokens" ALTER COLUMN "id" SET DEFAULT "nextval"('"auth"."refresh_tokens_id_seq"'::"regclass");



ALTER TABLE ONLY "billing"."credit_ledger" ALTER COLUMN "id" SET DEFAULT "nextval"('"billing"."credit_ledger_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_checklist_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_checklist_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tags_id_seq"'::"regclass");



ALTER TABLE ONLY "auth"."mfa_amr_claims"
    ADD CONSTRAINT "amr_id_pk" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."audit_log_entries"
    ADD CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."flow_state"
    ADD CONSTRAINT "flow_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."identities"
    ADD CONSTRAINT "identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."identities"
    ADD CONSTRAINT "identities_provider_id_provider_unique" UNIQUE ("provider_id", "provider");



ALTER TABLE ONLY "auth"."instances"
    ADD CONSTRAINT "instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."mfa_amr_claims"
    ADD CONSTRAINT "mfa_amr_claims_session_id_authentication_method_pkey" UNIQUE ("session_id", "authentication_method");



ALTER TABLE ONLY "auth"."mfa_challenges"
    ADD CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."mfa_factors"
    ADD CONSTRAINT "mfa_factors_last_challenged_at_key" UNIQUE ("last_challenged_at");



ALTER TABLE ONLY "auth"."mfa_factors"
    ADD CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."one_time_tokens"
    ADD CONSTRAINT "one_time_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_token_unique" UNIQUE ("token");



ALTER TABLE ONLY "auth"."saml_providers"
    ADD CONSTRAINT "saml_providers_entity_id_key" UNIQUE ("entity_id");



ALTER TABLE ONLY "auth"."saml_providers"
    ADD CONSTRAINT "saml_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."saml_relay_states"
    ADD CONSTRAINT "saml_relay_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "auth"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."sso_domains"
    ADD CONSTRAINT "sso_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."sso_providers"
    ADD CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."users"
    ADD CONSTRAINT "users_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "auth"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."credit_ledger"
    ADD CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."credit_pack_purchases"
    ADD CONSTRAINT "credit_pack_purchases_paypal_order_id_key" UNIQUE ("paypal_order_id");



ALTER TABLE ONLY "billing"."credit_pack_purchases"
    ADD CONSTRAINT "credit_pack_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."credit_packs"
    ADD CONSTRAINT "credit_packs_name_key" UNIQUE ("name");



ALTER TABLE ONLY "billing"."credit_packs"
    ADD CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."credits"
    ADD CONSTRAINT "credits_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "billing"."models"
    ADD CONSTRAINT "models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."models"
    ADD CONSTRAINT "models_provider_model_id_key" UNIQUE ("provider_model_id");



ALTER TABLE ONLY "billing"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "billing"."transactions"
    ADD CONSTRAINT "transactions_gateway_transaction_id_key" UNIQUE ("gateway_transaction_id");



ALTER TABLE ONLY "billing"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_definitions"
    ADD CONSTRAINT "character_definitions_pkey" PRIMARY KEY ("character_id");



ALTER TABLE ONLY "public"."character_favorites"
    ADD CONSTRAINT "character_favorites_character_id_user_id_key" UNIQUE ("character_id", "user_id");



ALTER TABLE ONLY "public"."character_favorites"
    ADD CONSTRAINT "character_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_latent_profile_history"
    ADD CONSTRAINT "character_latent_profile_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_latent_profiles"
    ADD CONSTRAINT "character_latent_profiles_pkey" PRIMARY KEY ("character_id");



ALTER TABLE ONLY "public"."character_likes"
    ADD CONSTRAINT "character_likes_character_id_user_id_key" UNIQUE ("character_id", "user_id");



ALTER TABLE ONLY "public"."character_likes"
    ADD CONSTRAINT "character_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_memories"
    ADD CONSTRAINT "character_memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_tags"
    ADD CONSTRAINT "character_tags_pkey" PRIMARY KEY ("character_id", "tag_id");



ALTER TABLE ONLY "public"."character_world_info_link"
    ADD CONSTRAINT "character_world_info_link_character_id_world_info_id_key" UNIQUE ("character_id", "world_info_id");



ALTER TABLE ONLY "public"."character_world_info_link"
    ADD CONSTRAINT "character_world_info_link_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_context"
    ADD CONSTRAINT "chat_context_chat_id_key" UNIQUE ("chat_id");



ALTER TABLE ONLY "public"."chat_context"
    ADD CONSTRAINT "chat_context_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_checklist_items"
    ADD CONSTRAINT "onboarding_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_checklist_items"
    ADD CONSTRAINT "onboarding_checklist_items_task_key_key" UNIQUE ("task_key");



ALTER TABLE ONLY "public"."parsed_character_cards"
    ADD CONSTRAINT "parsed_character_cards_pkey" PRIMARY KEY ("hash");



ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."public_app_settings"
    ADD CONSTRAINT "public_app_settings_pkey" PRIMARY KEY ("setting_key");



ALTER TABLE ONLY "public"."subscription_nonces"
    ADD CONSTRAINT "subscription_nonces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_age_verification"
    ADD CONSTRAINT "user_age_verification_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_age_verification"
    ADD CONSTRAINT "user_age_verification_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_character_relationship_progress"
    ADD CONSTRAINT "user_character_relationship_progress_pkey" PRIMARY KEY ("user_id", "character_id");



ALTER TABLE ONLY "public"."user_character_relationship_signals"
    ADD CONSTRAINT "user_character_relationship_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_character_settings"
    ADD CONSTRAINT "user_character_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_character_settings"
    ADD CONSTRAINT "user_character_settings_unique" UNIQUE ("user_id", "character_id");



ALTER TABLE ONLY "public"."user_character_world_info_settings"
    ADD CONSTRAINT "user_character_world_info_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_character_world_info_settings"
    ADD CONSTRAINT "user_character_world_info_settings_unique" UNIQUE ("user_id", "character_id");



ALTER TABLE ONLY "public"."user_global_chat_settings"
    ADD CONSTRAINT "user_global_chat_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_global_chat_settings"
    ADD CONSTRAINT "user_global_chat_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."world_info_entries"
    ADD CONSTRAINT "world_info_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."world_info_tags"
    ADD CONSTRAINT "world_info_tags_pkey" PRIMARY KEY ("world_info_id", "tag_id");



ALTER TABLE ONLY "public"."world_info_user_likes"
    ADD CONSTRAINT "world_info_user_likes_pkey" PRIMARY KEY ("user_id", "world_info_id");



ALTER TABLE ONLY "public"."world_infos"
    ADD CONSTRAINT "world_infos_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_logs_instance_id_idx" ON "auth"."audit_log_entries" USING "btree" ("instance_id");



CREATE UNIQUE INDEX "confirmation_token_idx" ON "auth"."users" USING "btree" ("confirmation_token") WHERE (("confirmation_token")::"text" !~ '^[0-9 ]*$'::"text");



CREATE UNIQUE INDEX "email_change_token_current_idx" ON "auth"."users" USING "btree" ("email_change_token_current") WHERE (("email_change_token_current")::"text" !~ '^[0-9 ]*$'::"text");



CREATE UNIQUE INDEX "email_change_token_new_idx" ON "auth"."users" USING "btree" ("email_change_token_new") WHERE (("email_change_token_new")::"text" !~ '^[0-9 ]*$'::"text");



CREATE INDEX "factor_id_created_at_idx" ON "auth"."mfa_factors" USING "btree" ("user_id", "created_at");



CREATE INDEX "flow_state_created_at_idx" ON "auth"."flow_state" USING "btree" ("created_at" DESC);



CREATE INDEX "identities_email_idx" ON "auth"."identities" USING "btree" ("email" "text_pattern_ops");



COMMENT ON INDEX "auth"."identities_email_idx" IS 'Auth: Ensures indexed queries on the email column';



CREATE INDEX "identities_user_id_idx" ON "auth"."identities" USING "btree" ("user_id");



CREATE INDEX "idx_auth_code" ON "auth"."flow_state" USING "btree" ("auth_code");



CREATE INDEX "idx_user_id_auth_method" ON "auth"."flow_state" USING "btree" ("user_id", "authentication_method");



CREATE INDEX "mfa_challenge_created_at_idx" ON "auth"."mfa_challenges" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "mfa_factors_user_friendly_name_unique" ON "auth"."mfa_factors" USING "btree" ("friendly_name", "user_id") WHERE (TRIM(BOTH FROM "friendly_name") <> ''::"text");



CREATE INDEX "mfa_factors_user_id_idx" ON "auth"."mfa_factors" USING "btree" ("user_id");



CREATE INDEX "one_time_tokens_relates_to_hash_idx" ON "auth"."one_time_tokens" USING "hash" ("relates_to");



CREATE INDEX "one_time_tokens_token_hash_hash_idx" ON "auth"."one_time_tokens" USING "hash" ("token_hash");



CREATE UNIQUE INDEX "one_time_tokens_user_id_token_type_key" ON "auth"."one_time_tokens" USING "btree" ("user_id", "token_type");



CREATE UNIQUE INDEX "reauthentication_token_idx" ON "auth"."users" USING "btree" ("reauthentication_token") WHERE (("reauthentication_token")::"text" !~ '^[0-9 ]*$'::"text");



CREATE UNIQUE INDEX "recovery_token_idx" ON "auth"."users" USING "btree" ("recovery_token") WHERE (("recovery_token")::"text" !~ '^[0-9 ]*$'::"text");



CREATE INDEX "refresh_tokens_instance_id_idx" ON "auth"."refresh_tokens" USING "btree" ("instance_id");



CREATE INDEX "refresh_tokens_instance_id_user_id_idx" ON "auth"."refresh_tokens" USING "btree" ("instance_id", "user_id");



CREATE INDEX "refresh_tokens_parent_idx" ON "auth"."refresh_tokens" USING "btree" ("parent");



CREATE INDEX "refresh_tokens_session_id_revoked_idx" ON "auth"."refresh_tokens" USING "btree" ("session_id", "revoked");



CREATE INDEX "refresh_tokens_updated_at_idx" ON "auth"."refresh_tokens" USING "btree" ("updated_at" DESC);



CREATE INDEX "saml_providers_sso_provider_id_idx" ON "auth"."saml_providers" USING "btree" ("sso_provider_id");



CREATE INDEX "saml_relay_states_created_at_idx" ON "auth"."saml_relay_states" USING "btree" ("created_at" DESC);



CREATE INDEX "saml_relay_states_for_email_idx" ON "auth"."saml_relay_states" USING "btree" ("for_email");



CREATE INDEX "saml_relay_states_sso_provider_id_idx" ON "auth"."saml_relay_states" USING "btree" ("sso_provider_id");



CREATE INDEX "sessions_not_after_idx" ON "auth"."sessions" USING "btree" ("not_after" DESC);



CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "sso_domains_domain_idx" ON "auth"."sso_domains" USING "btree" ("lower"("domain"));



CREATE INDEX "sso_domains_sso_provider_id_idx" ON "auth"."sso_domains" USING "btree" ("sso_provider_id");



CREATE UNIQUE INDEX "sso_providers_resource_id_idx" ON "auth"."sso_providers" USING "btree" ("lower"("resource_id"));



CREATE UNIQUE INDEX "unique_phone_factor_per_user" ON "auth"."mfa_factors" USING "btree" ("user_id", "phone");



CREATE INDEX "user_id_created_at_idx" ON "auth"."sessions" USING "btree" ("user_id", "created_at");



CREATE UNIQUE INDEX "users_email_partial_key" ON "auth"."users" USING "btree" ("email") WHERE ("is_sso_user" = false);



COMMENT ON INDEX "auth"."users_email_partial_key" IS 'Auth: A partial unique index that applies only when is_sso_user is false';



CREATE INDEX "users_instance_id_email_idx" ON "auth"."users" USING "btree" ("instance_id", "lower"(("email")::"text"));



CREATE INDEX "users_instance_id_idx" ON "auth"."users" USING "btree" ("instance_id");



CREATE INDEX "users_is_anonymous_idx" ON "auth"."users" USING "btree" ("is_anonymous");



CREATE INDEX "billing_credit_ledger_user_id_id_desc_idx" ON "billing"."credit_ledger" USING "btree" ("user_id", "id" DESC);



CREATE INDEX "billing_credit_pack_purchases_user_created_idx" ON "billing"."credit_pack_purchases" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "billing_subscriptions_active_user_idx" ON "billing"."subscriptions" USING "btree" ("user_id") WHERE ("status" = 'active'::"billing"."subscription_status");



CREATE INDEX "billing_subscriptions_status_period_end_idx" ON "billing"."subscriptions" USING "btree" ("status", "current_period_end");



CREATE INDEX "billing_transactions_user_created_idx" ON "billing"."transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_billing_credit_pack_purchases_pack" ON "billing"."credit_pack_purchases" USING "btree" ("credit_pack_id");



CREATE INDEX "idx_billing_credit_pack_purchases_status" ON "billing"."credit_pack_purchases" USING "btree" ("status");



CREATE INDEX "idx_billing_credit_packs_active" ON "billing"."credit_packs" USING "btree" ("is_active");



CREATE INDEX "idx_billing_transactions_purchase_type" ON "billing"."transactions" USING "btree" ("purchase_type");



CREATE INDEX "idx_plans_model_id" ON "billing"."plans" USING "btree" ("model_id");



CREATE INDEX "character_memories_character_id_idx" ON "public"."character_memories" USING "btree" ("character_id");



CREATE INDEX "character_memories_user_character_idx" ON "public"."character_memories" USING "btree" ("user_id", "character_id");



CREATE INDEX "idx_character_favorites_character_id" ON "public"."character_favorites" USING "btree" ("character_id");



CREATE INDEX "idx_character_latent_profile_history_char" ON "public"."character_latent_profile_history" USING "btree" ("character_id");



CREATE INDEX "idx_character_latent_profile_history_hash" ON "public"."character_latent_profile_history" USING "btree" ("source_card_hash");



CREATE INDEX "idx_character_latent_profiles_hash" ON "public"."character_latent_profiles" USING "btree" ("source_card_hash");



CREATE INDEX "idx_character_likes_character_id" ON "public"."character_likes" USING "btree" ("character_id");



CREATE INDEX "idx_character_memories_chat_auto_created" ON "public"."character_memories" USING "btree" ("chat_id", "is_auto_summary", "created_at" DESC);



CREATE INDEX "idx_character_memories_chat_auto_message_count" ON "public"."character_memories" USING "btree" ("chat_id", "is_auto_summary", "message_count");



CREATE INDEX "idx_character_memories_keywords" ON "public"."character_memories" USING "gin" ("trigger_keywords");



CREATE INDEX "idx_character_memories_lookup" ON "public"."character_memories" USING "btree" ("chat_id", "character_id", "is_auto_summary", "created_at" DESC);



CREATE INDEX "idx_character_memories_nonauto_user_char_updated" ON "public"."character_memories" USING "btree" ("user_id", "character_id", "is_auto_summary", "updated_at" DESC);



CREATE INDEX "idx_character_memories_user_character" ON "public"."character_memories" USING "btree" ("user_id", "character_id");



CREATE INDEX "idx_character_tags_character_id" ON "public"."character_tags" USING "btree" ("character_id");



CREATE INDEX "idx_character_tags_tag_id" ON "public"."character_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_character_world_info_link_character_id" ON "public"."character_world_info_link" USING "btree" ("character_id");



CREATE INDEX "idx_character_world_info_link_world_info_id" ON "public"."character_world_info_link" USING "btree" ("world_info_id");



CREATE INDEX "idx_characters_visibility_interactions" ON "public"."characters" USING "btree" ("visibility", "interaction_count" DESC);



CREATE INDEX "idx_chat_context_composite" ON "public"."chat_context" USING "btree" ("chat_id", "user_id", "character_id");



CREATE INDEX "idx_chat_context_updated_at" ON "public"."chat_context" USING "btree" ("updated_at");



CREATE INDEX "idx_chat_context_user_character" ON "public"."chat_context" USING "btree" ("user_id", "character_id");



CREATE INDEX "idx_chats_character_id" ON "public"."chats" USING "btree" ("character_id");



CREATE INDEX "idx_chats_character_last_message" ON "public"."chats" USING "btree" ("character_id", "last_message_at" DESC);



CREATE INDEX "idx_chats_chat_mode" ON "public"."chats" USING "btree" ("chat_mode");



CREATE INDEX "idx_chats_selected_persona_id" ON "public"."chats" USING "btree" ("selected_persona_id");



CREATE INDEX "idx_chats_user_id" ON "public"."chats" USING "btree" ("user_id");



CREATE INDEX "idx_chats_user_updated_at" ON "public"."chats" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_messages_chat_created_at" ON "public"."messages" USING "btree" ("chat_id", "created_at" DESC);



CREATE INDEX "idx_messages_chat_id" ON "public"."messages" USING "btree" ("chat_id");



CREATE INDEX "idx_messages_chat_id_created_at" ON "public"."messages" USING "btree" ("chat_id", "created_at" DESC);



CREATE INDEX "idx_messages_chat_isai_order" ON "public"."messages" USING "btree" ("chat_id", "is_ai_message", "message_order");



CREATE INDEX "idx_messages_chat_order" ON "public"."messages" USING "btree" ("chat_id", "message_order");



CREATE INDEX "idx_messages_chat_real" ON "public"."messages" USING "btree" ("chat_id", "is_placeholder", "created_at") WHERE ("is_placeholder" = false);



CREATE INDEX "idx_messages_current_context" ON "public"."messages" USING "gin" ("current_context") WHERE ("current_context" IS NOT NULL);



CREATE INDEX "idx_parsed_character_cards_created_at" ON "public"."parsed_character_cards" USING "btree" ("created_at");



CREATE INDEX "idx_subscription_nonces_created_at" ON "public"."subscription_nonces" USING "btree" ("created_at");



CREATE INDEX "idx_subscription_nonces_user" ON "public"."subscription_nonces" USING "btree" ("user_id");



CREATE INDEX "idx_ucrp_character" ON "public"."user_character_relationship_progress" USING "btree" ("character_id");



CREATE INDEX "idx_ucrp_updated_at" ON "public"."user_character_relationship_progress" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_ucrs_char" ON "public"."user_character_relationship_signals" USING "btree" ("character_id");



CREATE INDEX "idx_ucrs_user_char_time" ON "public"."user_character_relationship_signals" USING "btree" ("user_id", "character_id", "created_at" DESC);



CREATE INDEX "idx_user_character_settings_lookup" ON "public"."user_character_settings" USING "btree" ("user_id", "character_id");



CREATE INDEX "idx_user_character_world_info_settings_character_id" ON "public"."user_character_world_info_settings" USING "btree" ("character_id");



CREATE INDEX "idx_user_character_world_info_settings_user_id" ON "public"."user_character_world_info_settings" USING "btree" ("user_id");



CREATE INDEX "idx_user_character_world_info_settings_world_info_id" ON "public"."user_character_world_info_settings" USING "btree" ("world_info_id");



CREATE INDEX "idx_user_global_chat_settings_user_id" ON "public"."user_global_chat_settings" USING "btree" ("user_id");



CREATE INDEX "idx_world_info_entries_world_info_id" ON "public"."world_info_entries" USING "btree" ("world_info_id");



CREATE INDEX "idx_world_info_tags_tag_id" ON "public"."world_info_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_world_info_tags_world_info_id" ON "public"."world_info_tags" USING "btree" ("world_info_id");



CREATE INDEX "idx_world_infos_creator_id" ON "public"."world_infos" USING "btree" ("creator_id");



CREATE UNIQUE INDEX "unique_auto_summary_per_chat_range" ON "public"."character_memories" USING "btree" ("user_id", "character_id", "chat_id", "message_count") WHERE ("is_auto_summary" = true);



CREATE UNIQUE INDEX "uq_auto_summary_content_hash_per_chat" ON "public"."character_memories" USING "btree" ("chat_id", "content_hash") WHERE ("is_auto_summary" = true);



CREATE UNIQUE INDEX "uq_auto_summary_range_explicit" ON "public"."character_memories" USING "btree" ("chat_id", "ai_sequence_end") WHERE ("is_auto_summary" = true);



CREATE OR REPLACE TRIGGER "on_auth_user_created_billing_provision" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."provision_billing_on_signup"();



CREATE OR REPLACE TRIGGER "on_auth_user_created_global_settings" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user_global_settings"();



CREATE OR REPLACE TRIGGER "trg_cpp_force_pending" BEFORE INSERT ON "billing"."credit_pack_purchases" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_credit_pack_purchase_status"();



CREATE OR REPLACE TRIGGER "tr_set_was_public" BEFORE INSERT OR UPDATE ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "public"."set_was_public_on_visibility_change"();



CREATE OR REPLACE TRIGGER "trg_character_latent_profiles_updated_at" BEFORE UPDATE ON "public"."character_latent_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_characters_chats_count" AFTER INSERT OR DELETE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."tg_characters_chats_count"();



CREATE OR REPLACE TRIGGER "trg_characters_favorites_count" AFTER INSERT OR DELETE ON "public"."character_favorites" FOR EACH ROW EXECUTE FUNCTION "public"."tg_characters_favorites_count"();



CREATE OR REPLACE TRIGGER "trg_characters_likes_count" AFTER INSERT OR DELETE ON "public"."character_likes" FOR EACH ROW EXECUTE FUNCTION "public"."tg_characters_likes_count"();



CREATE OR REPLACE TRIGGER "trg_characters_messages_count" AFTER INSERT OR DELETE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."tg_characters_messages_count"();



CREATE OR REPLACE TRIGGER "trg_set_ai_sequence_number" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_ai_sequence_number"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_characters" BEFORE UPDATE ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_chat_context" BEFORE UPDATE ON "public"."chat_context" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_chats" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_messages" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_personas" BEFORE UPDATE ON "public"."personas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_ucwis" BEFORE UPDATE ON "public"."user_character_world_info_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_user_global_chat_settings" BEFORE UPDATE ON "public"."user_global_chat_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_world_info_entries" BEFORE UPDATE ON "public"."world_info_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_world_infos" BEFORE UPDATE ON "public"."world_infos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ucrp_updated_at" BEFORE UPDATE ON "public"."user_character_relationship_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_rel_progress"();



CREATE OR REPLACE TRIGGER "update_profiles_banner_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_banner_updated_at"();



ALTER TABLE ONLY "auth"."identities"
    ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."mfa_amr_claims"
    ADD CONSTRAINT "mfa_amr_claims_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."mfa_challenges"
    ADD CONSTRAINT "mfa_challenges_auth_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "auth"."mfa_factors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."mfa_factors"
    ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."one_time_tokens"
    ADD CONSTRAINT "one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."saml_providers"
    ADD CONSTRAINT "saml_providers_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."saml_relay_states"
    ADD CONSTRAINT "saml_relay_states_flow_state_id_fkey" FOREIGN KEY ("flow_state_id") REFERENCES "auth"."flow_state"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."saml_relay_states"
    ADD CONSTRAINT "saml_relay_states_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."sso_domains"
    ADD CONSTRAINT "sso_domains_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."credit_ledger"
    ADD CONSTRAINT "credit_ledger_related_message_id_fkey" FOREIGN KEY ("related_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "billing"."credit_ledger"
    ADD CONSTRAINT "credit_ledger_related_transaction_id_fkey" FOREIGN KEY ("related_transaction_id") REFERENCES "billing"."transactions"("id");



ALTER TABLE ONLY "billing"."credit_ledger"
    ADD CONSTRAINT "credit_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."credit_pack_purchases"
    ADD CONSTRAINT "credit_pack_purchases_credit_pack_id_fkey" FOREIGN KEY ("credit_pack_id") REFERENCES "billing"."credit_packs"("id");



ALTER TABLE ONLY "billing"."credit_pack_purchases"
    ADD CONSTRAINT "credit_pack_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."credits"
    ADD CONSTRAINT "credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."plans"
    ADD CONSTRAINT "plans_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "billing"."models"("id");



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id");



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."transactions"
    ADD CONSTRAINT "transactions_credit_pack_purchase_id_fkey" FOREIGN KEY ("credit_pack_purchase_id") REFERENCES "billing"."credit_pack_purchases"("id");



ALTER TABLE ONLY "billing"."transactions"
    ADD CONSTRAINT "transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id");



ALTER TABLE ONLY "billing"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_definitions"
    ADD CONSTRAINT "character_definitions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_favorites"
    ADD CONSTRAINT "character_favorites_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_latent_profile_history"
    ADD CONSTRAINT "character_latent_profile_history_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_latent_profiles"
    ADD CONSTRAINT "character_latent_profiles_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_likes"
    ADD CONSTRAINT "character_likes_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_memories"
    ADD CONSTRAINT "character_memories_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id");



ALTER TABLE ONLY "public"."character_memories"
    ADD CONSTRAINT "character_memories_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."character_memories"
    ADD CONSTRAINT "character_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."character_tags"
    ADD CONSTRAINT "character_tags_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_tags"
    ADD CONSTRAINT "character_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_world_info_link"
    ADD CONSTRAINT "character_world_info_link_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_world_info_link"
    ADD CONSTRAINT "character_world_info_link_world_info_id_fkey" FOREIGN KEY ("world_info_id") REFERENCES "public"."world_infos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_context"
    ADD CONSTRAINT "chat_context_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id");



ALTER TABLE ONLY "public"."chat_context"
    ADD CONSTRAINT "chat_context_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id");



ALTER TABLE ONLY "public"."chat_context"
    ADD CONSTRAINT "chat_context_last_updated_by_message_id_fkey" FOREIGN KEY ("last_updated_by_message_id") REFERENCES "public"."messages"("id");



ALTER TABLE ONLY "public"."chat_context"
    ADD CONSTRAINT "chat_context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "fk_chats_selected_persona" FOREIGN KEY ("selected_persona_id") REFERENCES "public"."personas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "fk_profiles_default_persona" FOREIGN KEY ("default_persona_id") REFERENCES "public"."personas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_nonces"
    ADD CONSTRAINT "subscription_nonces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_age_verification"
    ADD CONSTRAINT "user_age_verification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_character_settings"
    ADD CONSTRAINT "user_character_settings_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_character_settings"
    ADD CONSTRAINT "user_character_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_character_world_info_settings"
    ADD CONSTRAINT "user_character_world_info_settings_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id");



ALTER TABLE ONLY "public"."user_character_world_info_settings"
    ADD CONSTRAINT "user_character_world_info_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_character_world_info_settings"
    ADD CONSTRAINT "user_character_world_info_settings_world_info_id_fkey" FOREIGN KEY ("world_info_id") REFERENCES "public"."world_infos"("id");



ALTER TABLE ONLY "public"."user_global_chat_settings"
    ADD CONSTRAINT "user_global_chat_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."world_info_entries"
    ADD CONSTRAINT "world_info_entries_world_info_id_fkey" FOREIGN KEY ("world_info_id") REFERENCES "public"."world_infos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."world_info_tags"
    ADD CONSTRAINT "world_info_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."world_info_tags"
    ADD CONSTRAINT "world_info_tags_world_info_id_fkey" FOREIGN KEY ("world_info_id") REFERENCES "public"."world_infos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."world_info_user_likes"
    ADD CONSTRAINT "world_info_user_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."world_info_user_likes"
    ADD CONSTRAINT "world_info_user_likes_world_info_id_fkey" FOREIGN KEY ("world_info_id") REFERENCES "public"."world_infos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."world_infos"
    ADD CONSTRAINT "world_infos_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "auth"."audit_log_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."flow_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."identities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."mfa_amr_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."mfa_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."mfa_factors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."one_time_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."refresh_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."saml_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."saml_relay_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."schema_migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."sso_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."sso_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Users can view own credits" ON "billing"."credits" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own purchases" ON "billing"."credit_pack_purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own subscriptions" ON "billing"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "billing_credit_pack_purchases_insert" ON "billing"."credit_pack_purchases" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "billing_credit_packs_select" ON "billing"."credit_packs" FOR SELECT USING (("is_active" = true));



CREATE POLICY "billing_models_select" ON "billing"."models" FOR SELECT USING (true);



CREATE POLICY "billing_plans_select" ON "billing"."plans" FOR SELECT USING (true);



CREATE POLICY "billing_transactions_select" ON "billing"."transactions" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "billing"."credit_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_ledger_block_delete" ON "billing"."credit_ledger" FOR DELETE USING (false);



CREATE POLICY "credit_ledger_block_insert" ON "billing"."credit_ledger" FOR INSERT WITH CHECK (false);



CREATE POLICY "credit_ledger_block_update" ON "billing"."credit_ledger" FOR UPDATE USING (false) WITH CHECK (false);



CREATE POLICY "credit_ledger_select" ON "billing"."credit_ledger" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "billing"."credit_pack_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."credit_packs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."credits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."models" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_users_read_latent_profiles" ON "public"."character_latent_profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "character_def_select" ON "public"."character_definitions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_definitions"."character_id") AND (("c"."visibility" = 'public'::"text") OR ("c"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "character_def_write" ON "public"."character_definitions" USING ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_definitions"."character_id") AND ("c"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_definitions"."character_id") AND ("c"."creator_id" = "auth"."uid"())))));



ALTER TABLE "public"."character_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."character_favorites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_favorites_select" ON "public"."character_favorites" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "character_favorites_write" ON "public"."character_favorites" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."character_latent_profile_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."character_latent_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."character_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_likes_select" ON "public"."character_likes" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "character_likes_write" ON "public"."character_likes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."character_memories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_memories_select" ON "public"."character_memories" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "character_memories_write" ON "public"."character_memories" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."character_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_tags_select" ON "public"."character_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_tags"."character_id") AND (("c"."visibility" = 'public'::"text") OR ("c"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "character_tags_write" ON "public"."character_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_tags"."character_id") AND ("c"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_tags"."character_id") AND ("c"."creator_id" = "auth"."uid"())))));



ALTER TABLE "public"."character_world_info_link" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."characters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "characters_delete" ON "public"."characters" FOR DELETE USING (("creator_id" = "auth"."uid"()));



CREATE POLICY "characters_insert" ON "public"."characters" FOR INSERT WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "characters_select" ON "public"."characters" FOR SELECT USING ((("visibility" = 'public'::"text") OR ("creator_id" = "auth"."uid"())));



CREATE POLICY "characters_update" ON "public"."characters" FOR UPDATE USING (("creator_id" = "auth"."uid"())) WITH CHECK (("creator_id" = "auth"."uid"()));



ALTER TABLE "public"."chat_context" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_context_all" ON "public"."chat_context" USING ((EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "chat_context"."chat_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "chat_context"."chat_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats_crud" ON "public"."chats" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "chats_select" ON "public"."chats" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "cwil_modify" ON "public"."character_world_info_link" USING ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_world_info_link"."character_id") AND ("c"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_world_info_link"."character_id") AND ("c"."creator_id" = "auth"."uid"())))));



CREATE POLICY "cwil_select" ON "public"."character_world_info_link" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_world_info_link"."character_id") AND ("c"."creator_id" = "auth"."uid"())))));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete" ON "public"."messages" FOR DELETE USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "messages"."chat_id") AND ("c"."user_id" = "auth"."uid"()))))));



CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "messages"."chat_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "messages"."chat_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "messages_update" ON "public"."messages" FOR UPDATE USING (((NOT "is_ai_message") AND (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "messages"."chat_id") AND ("c"."user_id" = "auth"."uid"())))))) WITH CHECK (((NOT "is_ai_message") AND (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "messages"."chat_id") AND ("c"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."onboarding_checklist_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_items_ro" ON "public"."onboarding_checklist_items" FOR SELECT USING (true);



ALTER TABLE "public"."parsed_character_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parsed_character_cards_block_delete" ON "public"."parsed_character_cards" FOR DELETE USING (false);



CREATE POLICY "parsed_character_cards_block_insert" ON "public"."parsed_character_cards" FOR INSERT WITH CHECK (false);



CREATE POLICY "parsed_character_cards_block_update" ON "public"."parsed_character_cards" FOR UPDATE USING (false) WITH CHECK (false);



CREATE POLICY "parsed_character_cards_select" ON "public"."parsed_character_cards" FOR SELECT USING (false);



ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personas_crud" ON "public"."personas" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "personas_select" ON "public"."personas" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_owner_select" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."public_app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_app_settings_select" ON "public"."public_app_settings" FOR SELECT USING (true);



CREATE POLICY "service role insert history" ON "public"."character_latent_profile_history" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role manage latent profiles" ON "public"."character_latent_profiles" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role manage relationship progress" ON "public"."user_character_relationship_progress" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role manage relationship signals" ON "public"."user_character_relationship_signals" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role select history" ON "public"."character_latent_profile_history" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."subscription_nonces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_nonces_service" ON "public"."subscription_nonces" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags_select" ON "public"."tags" FOR SELECT USING (true);



CREATE POLICY "uav_self" ON "public"."user_age_verification" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "uav_self_write" ON "public"."user_age_verification" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user manage own relationship progress" ON "public"."user_character_relationship_progress" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user manage own relationship signals" ON "public"."user_character_relationship_signals" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_age_verification" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_character_relationship_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_character_relationship_signals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_character_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_character_settings_all" ON "public"."user_character_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_character_world_info_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_character_world_info_settings_all" ON "public"."user_character_world_info_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_global_chat_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_global_chat_settings_owner" ON "public"."user_global_chat_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."world_info_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "world_info_entries_all" ON "public"."world_info_entries" USING ((EXISTS ( SELECT 1
   FROM "public"."world_infos" "w"
  WHERE (("w"."id" = "world_info_entries"."world_info_id") AND ("w"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."world_infos" "w"
  WHERE (("w"."id" = "world_info_entries"."world_info_id") AND ("w"."creator_id" = "auth"."uid"())))));



ALTER TABLE "public"."world_info_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "world_info_tags_all" ON "public"."world_info_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."world_infos" "w"
  WHERE (("w"."id" = "world_info_tags"."world_info_id") AND ("w"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."world_infos" "w"
  WHERE (("w"."id" = "world_info_tags"."world_info_id") AND ("w"."creator_id" = "auth"."uid"())))));



ALTER TABLE "public"."world_info_user_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "world_info_user_likes_all" ON "public"."world_info_user_likes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."world_infos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "world_infos_crud" ON "public"."world_infos" USING (("creator_id" = "auth"."uid"())) WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "world_infos_public_select" ON "public"."world_infos" FOR SELECT USING ((("visibility" = 'public'::"text") OR ("creator_id" = "auth"."uid"())));



GRANT USAGE ON SCHEMA "auth" TO "anon";
GRANT USAGE ON SCHEMA "auth" TO "authenticated";
GRANT USAGE ON SCHEMA "auth" TO "service_role";
GRANT ALL ON SCHEMA "auth" TO "supabase_auth_admin";
GRANT ALL ON SCHEMA "auth" TO "dashboard_user";
GRANT USAGE ON SCHEMA "auth" TO "postgres";



GRANT USAGE ON SCHEMA "billing" TO "anon";
GRANT USAGE ON SCHEMA "billing" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "auth"."email"() TO "dashboard_user";
GRANT ALL ON FUNCTION "auth"."email"() TO "postgres";



GRANT ALL ON FUNCTION "auth"."jwt"() TO "postgres";
GRANT ALL ON FUNCTION "auth"."jwt"() TO "dashboard_user";



GRANT ALL ON FUNCTION "auth"."role"() TO "dashboard_user";
GRANT ALL ON FUNCTION "auth"."role"() TO "postgres";



GRANT ALL ON FUNCTION "auth"."uid"() TO "dashboard_user";
GRANT ALL ON FUNCTION "auth"."uid"() TO "postgres";



GRANT ALL ON FUNCTION "public"."_assert_self"("p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_assert_self"("p_target" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_transaction_type" "text", "p_reference_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_transaction_type" "text", "p_reference_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_relationship_stage"("p_user_id" "uuid", "p_character_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_relationship_stage"("p_user_id" "uuid", "p_character_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."array_all_item_length_lte"("arr" "text"[], "max_len" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."array_all_item_length_lte"("arr" "text"[], "max_len" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_all_item_length_lte"("arr" "text"[], "max_len" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_subscription"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_cancel_immediately" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_subscription"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_cancel_immediately" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_disabled_addon_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_relationship_regression"("p_user_id" "uuid", "p_character_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_relationship_regression"("p_user_id" "uuid", "p_character_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_chat_with_greeting"("p_character_id" "uuid", "p_user_id" "uuid", "p_user_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_chat_with_greeting"("p_character_id" "uuid", "p_user_id" "uuid", "p_user_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_world_info_interaction_count"("world_info_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_operation_type" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_user_credits"("p_user_id" "uuid", "p_amount" integer, "p_operation_type" "text", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_chat_complete"("p_chat_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_chat_complete"("p_chat_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_private_character"("p_character_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_private_character"("p_character_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_account"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_account"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_credit_pack_purchase_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_credit_pack_purchase_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_relationship_progress"("p_user_id" "uuid", "p_character_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_relationship_progress"("p_user_id" "uuid", "p_character_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fetch_world_info_full"("p_world_info_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fetch_world_info_full"("p_world_info_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fetch_world_info_full"("p_world_info_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."fetch_world_info_full"("p_world_info_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."force_relationship_ready"("p_user_id" "uuid", "p_character_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."force_relationship_ready"("p_user_id" "uuid", "p_character_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gentle_addon_context_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_billing_catalog"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_billing_catalog"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_character_stats"("character_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_character_stats"("character_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_character_stats"("character_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."get_chat_context"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_context"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_chat_messages"("p_chat_id" "uuid", "p_limit" integer, "p_before_order" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_messages"("p_chat_id" "uuid", "p_limit" integer, "p_before_order" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_chat_snapshot"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid", "p_limit" integer, "p_before_order" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_snapshot"("p_chat_id" "uuid", "p_user_id" "uuid", "p_character_id" "uuid", "p_limit" integer, "p_before_order" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_credit_history"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_credit_history"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_character_cards"("p_search" "text", "p_sort" "text", "p_tag_ids" integer[], "p_creator_username" "text", "p_include_nsfw" boolean, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_character_cards"("p_search" "text", "p_sort" "text", "p_tag_ids" integer[], "p_creator_username" "text", "p_include_nsfw" boolean, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_character_cards"("p_search" "text", "p_sort" "text", "p_tag_ids" integer[], "p_creator_username" "text", "p_include_nsfw" boolean, "p_limit" integer, "p_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_character_cards"("p_search" "text", "p_sort" "text", "p_tag_ids" integer[], "p_creator_username" "text", "p_include_nsfw" boolean, "p_limit" integer, "p_offset" integer) TO "anon";



REVOKE ALL ON FUNCTION "public"."get_public_profile_overview"("p_target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_profile_overview"("p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_profile_overview"("p_target_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_profile_overview"("p_target_user_id" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."get_user_billing_overview"("p_user_id" "uuid", "p_purchases_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_billing_overview"("p_user_id" "uuid", "p_purchases_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_billing_overview"("p_user_id" "uuid", "p_purchases_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_bootstrap"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_bootstrap"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_bootstrap"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_chats"("p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_chats"("p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_credit_purchases"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_credit_purchases"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_credits"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_credits"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_dashboard_overview"("p_user_id" "uuid", "p_chars_limit" integer, "p_favs_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_dashboard_overview"("p_user_id" "uuid", "p_chars_limit" integer, "p_favs_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_dashboard_overview"("p_user_id" "uuid", "p_chars_limit" integer, "p_favs_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_persona_context"("p_user_id" "uuid", "p_chat_id" "uuid", "p_include_list" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_persona_context"("p_user_id" "uuid", "p_chat_id" "uuid", "p_include_list" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_persona_context"("p_user_id" "uuid", "p_chat_id" "uuid", "p_include_list" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_subscription_with_plan"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_subscription_with_plan"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_monthly_allowances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_global_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_world_info_interaction_count"("world_info_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_public_world_infos"("p_search" "text", "p_sort" "text", "p_offset" integer, "p_limit" integer, "p_exclude_nsfw" boolean, "p_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_public_world_infos"("p_search" "text", "p_sort" "text", "p_offset" integer, "p_limit" integer, "p_exclude_nsfw" boolean, "p_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_public_world_infos"("p_search" "text", "p_sort" "text", "p_offset" integer, "p_limit" integer, "p_exclude_nsfw" boolean, "p_tag_ids" integer[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."list_public_world_infos"("p_search" "text", "p_sort" "text", "p_offset" integer, "p_limit" integer, "p_exclude_nsfw" boolean, "p_tag_ids" integer[]) TO "anon";



GRANT ALL ON FUNCTION "public"."list_user_world_infos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_user_world_infos"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_user_world_infos"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_user_world_infos"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_user_world_infos"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_memories_injected"("mem_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_memories_injected"("mem_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_new_context_for_disabled_addons"() TO "service_role";



GRANT ALL ON FUNCTION "public"."provision_billing_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prune_expired_summary_locks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prune_stale_subscription_nonces"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_relationship_signal"("p_user_id" "uuid", "p_character_id" "uuid", "p_kind" "text", "p_weight" numeric, "p_polarity" smallint, "p_source_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_relationship_signal"("p_user_id" "uuid", "p_character_id" "uuid", "p_kind" "text", "p_weight" numeric, "p_polarity" smallint, "p_source_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."related_characters"("current_character_id" "uuid", "tag_ids" integer[]) TO "anon";
GRANT ALL ON FUNCTION "public"."related_characters"("current_character_id" "uuid", "tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."related_characters"("current_character_id" "uuid", "tag_ids" integer[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_tag_names"("p_names" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_tag_names"("p_names" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_ai_sequence_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_rel_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_rel_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_was_public_on_visibility_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_characters_chats_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_characters_favorites_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_characters_likes_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_characters_messages_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_world_info_like"("p_world_info_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_world_info_like"("p_world_info_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_cleanup_disabled_addon_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_banner_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_character_latent_profile"("p_character_id" "uuid", "p_profile" "jsonb", "p_source_card_hash" "text", "p_extraction_version" "text", "p_confidence_avg" numeric, "p_populated_domains" smallint, "p_token_cost" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_character_latent_profile"("p_character_id" "uuid", "p_profile" "jsonb", "p_source_card_hash" "text", "p_extraction_version" "text", "p_confidence_avg" numeric, "p_populated_domains" smallint, "p_token_cost" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_character_latent_profile"("p_character_id" "uuid", "p_profile" "jsonb", "p_source_card_hash" "text", "p_extraction_version" "text", "p_confidence_avg" numeric, "p_populated_domains" smallint, "p_token_cost" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_relationship_goals"("p_character_id" "uuid", "p_relationship_goals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_relationship_goals"("p_character_id" "uuid", "p_relationship_goals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_paypal_subscription_id" "text", "p_stripe_subscription_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_subscription"("p_user_id" "uuid", "p_plan_id" "uuid", "p_paypal_subscription_id" "text", "p_stripe_subscription_id" "text", "p_status" "text", "p_current_period_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."user_daily_usage_touch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_world_infos_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_world_infos_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."zz_jsonb_noarg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."zz_jsonb_noarg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."zz_list_user_world_infos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."zz_list_user_world_infos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."zz_test_rpc"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."zz_test_rpc"() TO "service_role";



GRANT ALL ON TABLE "auth"."audit_log_entries" TO "dashboard_user";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."audit_log_entries" TO "postgres";
GRANT SELECT ON TABLE "auth"."audit_log_entries" TO "postgres" WITH GRANT OPTION;



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."flow_state" TO "postgres";
GRANT SELECT ON TABLE "auth"."flow_state" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."flow_state" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."identities" TO "postgres";
GRANT SELECT ON TABLE "auth"."identities" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."identities" TO "dashboard_user";



GRANT ALL ON TABLE "auth"."instances" TO "dashboard_user";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."instances" TO "postgres";
GRANT SELECT ON TABLE "auth"."instances" TO "postgres" WITH GRANT OPTION;



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."mfa_amr_claims" TO "postgres";
GRANT SELECT ON TABLE "auth"."mfa_amr_claims" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."mfa_amr_claims" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."mfa_challenges" TO "postgres";
GRANT SELECT ON TABLE "auth"."mfa_challenges" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."mfa_challenges" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."mfa_factors" TO "postgres";
GRANT SELECT ON TABLE "auth"."mfa_factors" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."mfa_factors" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."one_time_tokens" TO "postgres";
GRANT SELECT ON TABLE "auth"."one_time_tokens" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."one_time_tokens" TO "dashboard_user";



GRANT ALL ON TABLE "auth"."refresh_tokens" TO "dashboard_user";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."refresh_tokens" TO "postgres";
GRANT SELECT ON TABLE "auth"."refresh_tokens" TO "postgres" WITH GRANT OPTION;



GRANT ALL ON SEQUENCE "auth"."refresh_tokens_id_seq" TO "dashboard_user";
GRANT ALL ON SEQUENCE "auth"."refresh_tokens_id_seq" TO "postgres";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."saml_providers" TO "postgres";
GRANT SELECT ON TABLE "auth"."saml_providers" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."saml_providers" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."saml_relay_states" TO "postgres";
GRANT SELECT ON TABLE "auth"."saml_relay_states" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."saml_relay_states" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."sessions" TO "postgres";
GRANT SELECT ON TABLE "auth"."sessions" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."sessions" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."sso_domains" TO "postgres";
GRANT SELECT ON TABLE "auth"."sso_domains" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."sso_domains" TO "dashboard_user";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."sso_providers" TO "postgres";
GRANT SELECT ON TABLE "auth"."sso_providers" TO "postgres" WITH GRANT OPTION;
GRANT ALL ON TABLE "auth"."sso_providers" TO "dashboard_user";



GRANT ALL ON TABLE "auth"."users" TO "dashboard_user";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "auth"."users" TO "postgres";
GRANT SELECT ON TABLE "auth"."users" TO "postgres" WITH GRANT OPTION;



GRANT SELECT ON TABLE "billing"."credit_ledger" TO "authenticated";



GRANT SELECT ON TABLE "billing"."credit_pack_purchases" TO "authenticated";



GRANT SELECT ON TABLE "billing"."credit_packs" TO "anon";
GRANT SELECT ON TABLE "billing"."credit_packs" TO "authenticated";



GRANT SELECT ON TABLE "billing"."credits" TO "authenticated";



GRANT SELECT ON TABLE "billing"."models" TO "anon";
GRANT SELECT ON TABLE "billing"."models" TO "authenticated";



GRANT SELECT ON TABLE "billing"."plans" TO "anon";
GRANT SELECT ON TABLE "billing"."plans" TO "authenticated";



GRANT SELECT ON TABLE "billing"."subscriptions" TO "authenticated";



GRANT SELECT ON TABLE "billing"."transactions" TO "authenticated";



GRANT ALL ON TABLE "public"."character_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."character_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."character_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."character_favorites" TO "service_role";



GRANT SELECT ON TABLE "public"."character_latent_profile_history" TO "authenticated";
GRANT ALL ON TABLE "public"."character_latent_profile_history" TO "service_role";



GRANT SELECT ON TABLE "public"."character_latent_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."character_latent_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."character_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."character_likes" TO "service_role";



GRANT ALL ON TABLE "public"."character_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."character_memories" TO "service_role";



GRANT ALL ON TABLE "public"."character_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."character_tags" TO "service_role";



GRANT ALL ON TABLE "public"."character_world_info_link" TO "authenticated";
GRANT ALL ON TABLE "public"."character_world_info_link" TO "service_role";



GRANT ALL ON TABLE "public"."characters" TO "authenticated";
GRANT ALL ON TABLE "public"."characters" TO "service_role";
GRANT SELECT ON TABLE "public"."characters" TO "anon";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."world_infos" TO "authenticated";
GRANT ALL ON TABLE "public"."world_infos" TO "service_role";



GRANT UPDATE("interaction_count") ON TABLE "public"."world_infos" TO "authenticated";



GRANT SELECT ON TABLE "public"."character_profile_view" TO "authenticated";
GRANT ALL ON TABLE "public"."character_profile_view" TO "service_role";
GRANT SELECT ON TABLE "public"."character_profile_view" TO "anon";



GRANT ALL ON TABLE "public"."chat_context" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_context" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_checklist_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_checklist_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_checklist_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parsed_character_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."parsed_character_cards" TO "service_role";



GRANT ALL ON TABLE "public"."personas" TO "authenticated";
GRANT ALL ON TABLE "public"."personas" TO "service_role";



GRANT ALL ON TABLE "public"."public_app_settings" TO "anon";
GRANT ALL ON TABLE "public"."public_app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."public_app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."public_profiles" TO "anon";
GRANT ALL ON TABLE "public"."public_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."public_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_nonces" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_age_verification" TO "authenticated";
GRANT ALL ON TABLE "public"."user_age_verification" TO "service_role";



GRANT SELECT ON TABLE "public"."user_character_relationship_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_character_relationship_progress" TO "service_role";



GRANT SELECT ON TABLE "public"."user_character_relationship_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."user_character_relationship_signals" TO "service_role";



GRANT ALL ON TABLE "public"."user_character_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_character_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_character_world_info_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_character_world_info_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_global_chat_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_global_chat_settings" TO "service_role";



GRANT ALL ON TABLE "public"."world_info_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."world_info_entries" TO "service_role";



GRANT ALL ON TABLE "public"."world_info_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."world_info_tags" TO "service_role";



GRANT ALL ON TABLE "public"."world_info_user_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."world_info_user_likes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT ALL ON SEQUENCES TO "dashboard_user";



ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT ALL ON FUNCTIONS TO "dashboard_user";



ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT ALL ON TABLES TO "dashboard_user";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "billing" GRANT SELECT,INSERT,UPDATE ON TABLES TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;
