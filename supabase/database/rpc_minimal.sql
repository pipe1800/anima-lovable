-- rpc_minimal.sql
-- Purpose: Minimal source-of-truth for application-exposed RPC functions.
-- Contains only the function definitions actually invoked from the app / server jobs,
-- plus required helper (_assert_self). No tables, indexes, RLS, grants, or trigger-only helpers.
-- NOTE: Assumes the underlying tables, enums, and auth helper functions (auth.uid, etc.) already exist.
-- Safe to run repeatedly (functions are CREATE OR REPLACE).

/* =============================================================
   HELPER (ownership enforcement)
   ============================================================= */
CREATE OR REPLACE FUNCTION public._assert_self(p_target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS DISTINCT FROM p_target THEN
      RAISE EXCEPTION 'Access denied (ownership check failed)';
    END IF;
  END IF;
END;
$$;
COMMENT ON FUNCTION public._assert_self(uuid) IS 'Ensures caller owns target user_id unless service_role.';

/* =============================================================
   BILLING & CREDITS
   ============================================================= */
CREATE OR REPLACE FUNCTION public.add_user_credits(
  p_user_id uuid,
  p_amount integer,
  p_transaction_type text,
  p_reference_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
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
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_transaction_type') INTO v_enum_exists;
  IF v_enum_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname='credit_transaction_type' AND e.enumlabel = v_type
    ) INTO v_valid_label;
    IF NOT v_valid_label THEN
      RAISE EXCEPTION 'Invalid credit_transaction_type label after mapping: %', v_type;
    END IF;
  END IF;
  INSERT INTO billing.credits(user_id,balance) VALUES(p_user_id,0)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_current FROM billing.credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_type IN ('subscription_allowance','initial_grant') THEN
    SELECT p.monthly_credits_allowance INTO v_allowance
    FROM billing.subscriptions s
    JOIN billing.plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id AND s.status='active'
    ORDER BY s.created_at DESC LIMIT 1;
    IF v_allowance IS NOT NULL THEN v_cap := v_allowance * 2; END IF;
  END IF;
  v_new := coalesce(v_current,0) + p_amount;
  IF v_cap IS NOT NULL AND v_new > v_cap THEN
    v_new := v_cap;
    v_effective_amount := v_cap - coalesce(v_current,0);
  ELSE
    v_effective_amount := p_amount;
  END IF;
  UPDATE billing.credits SET balance = v_new WHERE user_id = p_user_id;
  IF v_effective_amount > 0 THEN
    IF p_reference_id IS NOT NULL THEN
      SELECT id INTO v_rel_txn FROM billing.transactions WHERE id = p_reference_id;
    END IF;
    INSERT INTO billing.credit_ledger(
      user_id, change_amount, transaction_type, description, related_transaction_id
    ) VALUES (
      p_user_id,
      v_effective_amount,
      v_type,
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
END;$$;
COMMENT ON FUNCTION public.add_user_credits(uuid,integer,text,uuid) IS 'Grant credits with mapping & cap for subscription_allowance/initial_grant.';

CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  p_user_id uuid,
  p_amount integer,
  p_operation_type text DEFAULT 'message_cost',
  p_description text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
DECLARE
  v_current integer; v_new integer;
  v_enum_exists boolean; v_valid_label boolean;
  v_raw_type text := lower(coalesce(p_operation_type,'message_cost'));
  v_type text;
BEGIN
  PERFORM public._assert_self(p_user_id);
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN NULL; END IF;
  v_type := CASE v_raw_type
              WHEN 'ai_operation' THEN 'message_cost'
              WHEN 'credit_grant' THEN 'admin_adjustment'
              WHEN 'trial_grant' THEN 'initial_grant'
              ELSE v_raw_type
            END;
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname='credit_transaction_type') INTO v_enum_exists;
  IF v_enum_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname='credit_transaction_type' AND e.enumlabel = v_type
    ) INTO v_valid_label;
    IF NOT v_valid_label THEN RAISE EXCEPTION 'Invalid credit_transaction_type label after mapping: %', v_type; END IF;
  END IF;
  INSERT INTO billing.credits(user_id,balance) VALUES(p_user_id,0) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_current FROM billing.credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_current < p_amount THEN RETURN NULL; END IF;
  v_new := v_current - p_amount;
  UPDATE billing.credits SET balance = v_new WHERE user_id = p_user_id;
  INSERT INTO billing.credit_ledger(user_id, change_amount, transaction_type, description)
  VALUES (p_user_id, -p_amount, v_type, coalesce(p_description,
    CASE v_type WHEN 'message_cost' THEN 'Message usage'
                WHEN 'image_gen_cost' THEN 'Image generation usage'
                ELSE initcap(replace(v_type,'_',' ')) END));
  RETURN v_new;
END;$$;
COMMENT ON FUNCTION public.deduct_user_credits(uuid,integer,text,text) IS 'Deduct credits; returns new balance or NULL if insufficient.';

CREATE OR REPLACE FUNCTION public.get_user_credits(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
DECLARE v_balance integer; BEGIN
  PERFORM public._assert_self(p_user_id);
  SELECT balance INTO v_balance FROM billing.credits WHERE user_id = p_user_id;
  RETURN coalesce(v_balance,0);
END;$$;

CREATE OR REPLACE FUNCTION public.get_credit_history(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  id bigint,
  change_amount integer,
  balance_after integer,
  transaction_type text,
  description text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  RETURN QUERY
  WITH ordered AS (
    SELECT cl.*, SUM(cl.change_amount) OVER (
      PARTITION BY cl.user_id ORDER BY cl.id
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
END;$$;

CREATE OR REPLACE FUNCTION public.get_user_credit_purchases(
  p_user_id uuid,
  p_limit integer DEFAULT 10
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  RETURN (
    SELECT json_agg(json_build_object(
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
    ) ORDER BY cpp.created_at DESC)
    FROM (
      SELECT * FROM billing.credit_pack_purchases
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      LIMIT GREATEST(p_limit,1)
    ) cpp
    JOIN billing.credit_packs cp ON cp.id = cpp.credit_pack_id
  );
END;$$;

CREATE OR REPLACE FUNCTION public.get_user_subscription_with_plan(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
DECLARE v record; BEGIN
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
END;$$;

CREATE OR REPLACE FUNCTION public.upsert_subscription(
  p_user_id uuid,
  p_plan_id uuid,
  p_paypal_subscription_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_current_period_end timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
DECLARE
  v_active uuid; v_id uuid;
  v_status billing.subscription_status; v_is_active boolean;
BEGIN
  PERFORM public._assert_self(p_user_id);
  SELECT is_active INTO v_is_active FROM billing.plans WHERE id = p_plan_id;
  IF v_is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Inactive or invalid plan'; END IF;
  SELECT CASE lower(p_status)
           WHEN 'active' THEN 'active'
           WHEN 'past_due' THEN 'past_due'
           WHEN 'canceled' THEN 'canceled'
           WHEN 'trialing' THEN 'trialing'
           ELSE NULL END::billing.subscription_status
    INTO v_status;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Invalid subscription status: %', p_status; END IF;
  SELECT id INTO v_active FROM billing.subscriptions
   WHERE user_id = p_user_id AND status='active'
   ORDER BY created_at DESC LIMIT 1;
  IF v_active IS NULL THEN
    INSERT INTO billing.subscriptions(
      user_id, plan_id, status, current_period_end,
      paypal_subscription_id, stripe_subscription_id
    ) VALUES (
      p_user_id, p_plan_id, v_status,
      coalesce(p_current_period_end, now() + interval '30 days'),
      p_paypal_subscription_id, p_stripe_subscription_id
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE billing.subscriptions
       SET plan_id = p_plan_id,
           status = v_status,
           current_period_end = coalesce(p_current_period_end, current_period_end),
           paypal_subscription_id = coalesce(p_paypal_subscription_id, paypal_subscription_id),
           stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id)
     WHERE id = v_active RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;$$;
COMMENT ON FUNCTION public.upsert_subscription(uuid,uuid,text,text,text,timestamptz) IS 'Create/update active subscription.';

CREATE OR REPLACE FUNCTION public.cancel_subscription(
  p_user_id uuid,
  p_subscription_id uuid DEFAULT NULL,
  p_cancel_immediately boolean DEFAULT false
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
DECLARE v_sub record; v_old_status text; v_new_period_end timestamptz; BEGIN
  PERFORM public._assert_self(p_user_id);
  SELECT * INTO v_sub FROM billing.subscriptions
  WHERE user_id = p_user_id AND (
    (p_subscription_id IS NULL AND status='active') OR
    (p_subscription_id IS NOT NULL AND id = p_subscription_id)
  ) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_old_status := v_sub.status;
  IF v_sub.status = 'canceled' THEN
    RETURN json_build_object('id', v_sub.id, 'status', v_sub.status,
      'current_period_end', v_sub.current_period_end, 'already_canceled', true);
  END IF;
  v_new_period_end := CASE WHEN p_cancel_immediately THEN LEAST(v_sub.current_period_end, now()) ELSE v_sub.current_period_end END;
  UPDATE billing.subscriptions SET status='canceled', current_period_end = v_new_period_end WHERE id = v_sub.id;
  RETURN json_build_object(
    'id', v_sub.id,
    'old_status', v_old_status,
    'new_status', 'canceled',
    'current_period_end', v_new_period_end,
    'canceled_immediately', p_cancel_immediately
  );
END;$$;

CREATE OR REPLACE FUNCTION public.grant_monthly_allowances()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing, auth
AS $$
DECLARE v_count integer := 0; r record; BEGIN
  FOR r IN
    SELECT s.user_id, s.id AS subscription_id, p.monthly_credits_allowance
    FROM billing.subscriptions s
    JOIN billing.plans p ON p.id = s.plan_id
    WHERE s.status='active' AND s.current_period_end <= now()
    FOR UPDATE
  LOOP
    UPDATE billing.subscriptions
       SET current_period_end = now() + interval '30 days'
     WHERE id = r.subscription_id;
    IF r.monthly_credits_allowance > 0 THEN
      PERFORM public.add_user_credits(r.user_id, r.monthly_credits_allowance, 'subscription_allowance', NULL);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;$$;
COMMENT ON FUNCTION public.grant_monthly_allowances() IS 'Process due subscriptions & grant monthly allowances.';

/* =============================================================
   CHAT / MESSAGING
   ============================================================= */
CREATE OR REPLACE FUNCTION public.create_chat_with_greeting(
  p_character_id uuid,
  p_user_id uuid,
  p_user_message text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE new_chat_id uuid; character_name text; character_greeting text; final_greeting text; v_user uuid := auth.uid(); BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = p_character_id AND (c.visibility IN ('public','unlisted') OR c.creator_id = v_user)
  ) THEN RAISE EXCEPTION 'Character not accessible'; END IF;
  SELECT name INTO character_name FROM public.characters WHERE id = p_character_id;
  SELECT greeting INTO character_greeting FROM public.character_definitions WHERE character_id = p_character_id;
  INSERT INTO public.chats(user_id, character_id, title)
    VALUES (v_user, p_character_id, 'Chat with ' || character_name)
    RETURNING id INTO new_chat_id;
  final_greeting := coalesce(NULLIF(character_greeting,''), 'Hello! It''s a pleasure to meet you. What''s on your mind?');
  INSERT INTO public.messages(chat_id, author_id, content, is_ai_message)
    VALUES (new_chat_id, p_character_id, final_greeting, true);
  IF p_user_message IS NOT NULL AND p_user_message <> '' THEN
    INSERT INTO public.messages(chat_id, author_id, content, is_ai_message, model_id)
      VALUES (new_chat_id, v_user, p_user_message, false, NULL);
  END IF;
  RETURN new_chat_id;
END;$$;
COMMENT ON FUNCTION public.create_chat_with_greeting(uuid,uuid,text) IS 'Creates chat for authenticated user; ignores supplied p_user_id.';

CREATE OR REPLACE FUNCTION public.delete_chat_complete(
  p_chat_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE v_owner uuid; BEGIN
  SELECT user_id INTO v_owner FROM public.chats WHERE id = p_chat_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Chat not found'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'Access denied'; END IF;
  DELETE FROM public.character_memories WHERE chat_id = p_chat_id;
  DELETE FROM public.chat_context WHERE chat_id = p_chat_id;
  DELETE FROM public.messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;
END;$$;
COMMENT ON FUNCTION public.delete_chat_complete(uuid,uuid) IS 'Deletes chat & related rows for owner; ignores p_user_id.';

CREATE OR REPLACE FUNCTION public.get_chat_context(
  p_chat_id uuid,
  p_user_id uuid,
  p_character_id uuid
) RETURNS TABLE(current_context jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT cc.current_context
  FROM public.chat_context cc
  JOIN public.chats c ON c.id = cc.chat_id
  WHERE cc.chat_id = p_chat_id
    AND cc.character_id = p_character_id
    AND c.user_id = auth.uid();
END;$$;

/* =============================================================
   CHARACTERS / DISCOVERY
   ============================================================= */
CREATE OR REPLACE FUNCTION public.get_character_stats(character_id uuid)
RETURNS TABLE(
  total_chats bigint,
  total_messages bigint,
  unique_users bigint,
  average_rating numeric,
  total_favorites bigint,
  total_likes bigint
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE can_view boolean; BEGIN
  SELECT (visibility = 'public' OR creator_id = auth.uid()) INTO can_view
  FROM public.characters WHERE id = character_id;
  IF NOT coalesce(can_view,false) THEN RAISE EXCEPTION 'Access denied'; END IF;
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
END;$$;

CREATE OR REPLACE FUNCTION public.related_characters(
  current_character_id uuid,
  tag_ids integer[]
) RETURNS TABLE(
  id uuid,
  name text,
  avatar_url text,
  short_description text,
  likes_count integer,
  chats_count integer,
  creator jsonb,
  tags jsonb
) LANGUAGE plpgsql
AS $$
BEGIN
  IF tag_ids IS NULL OR array_length(tag_ids,1) IS NULL THEN
    RETURN QUERY
    SELECT c.id, c.name, c.avatar_url, c.short_description, c.likes_count, c.chats_count,
           jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) AS creator,
           coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
                     FROM (SELECT DISTINCT t.id, t.name FROM public.character_tags ct JOIN public.tags t ON t.id=ct.tag_id WHERE ct.character_id = c.id) s),'[]'::jsonb) AS tags
    FROM public.characters c
    LEFT JOIN public.profiles p ON p.id = c.creator_id
    WHERE c.visibility = 'public' AND c.id <> current_character_id
    ORDER BY c.chats_count DESC, c.likes_count DESC
    LIMIT 10;
  ELSE
    RETURN QUERY
    WITH related AS (
      SELECT ct.character_id, COUNT(*) AS overlap
      FROM public.character_tags ct
      WHERE ct.tag_id = ANY(tag_ids) AND ct.character_id <> current_character_id
      GROUP BY ct.character_id
    )
    SELECT c.id, c.name, c.avatar_url, c.short_description, c.likes_count, c.chats_count,
           jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) AS creator,
           coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
                     FROM (SELECT DISTINCT t.id, t.name FROM public.character_tags ct2 JOIN public.tags t ON t.id=ct2.tag_id WHERE ct2.character_id = c.id) s),'[]'::jsonb) AS tags
    FROM related r
    JOIN public.characters c ON c.id = r.character_id
    LEFT JOIN public.profiles p ON p.id = c.creator_id
    WHERE c.visibility = 'public'
    ORDER BY r.overlap DESC, c.chats_count DESC, c.likes_count DESC
    LIMIT 10;
  END IF;
END;$$;

/* =============================================================
   WORLD INFO
   ============================================================= */
CREATE OR REPLACE FUNCTION public.toggle_world_info_like(p_world_info_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_user_id uuid; v_exists boolean; v_new_count integer; BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(
    SELECT 1 FROM world_info_user_likes WHERE user_id = v_user_id AND world_info_id = p_world_info_id
  ) INTO v_exists;
  IF v_exists THEN
    DELETE FROM world_info_user_likes WHERE user_id = v_user_id AND world_info_id = p_world_info_id;
    UPDATE world_infos SET likes_count = GREATEST(0, likes_count - 1)
      WHERE id = p_world_info_id RETURNING likes_count INTO v_new_count;
    RETURN jsonb_build_object('liked', false, 'likes_count', v_new_count);
  ELSE
    INSERT INTO world_info_user_likes(user_id, world_info_id) VALUES (v_user_id, p_world_info_id);
    UPDATE world_infos SET likes_count = likes_count + 1
      WHERE id = p_world_info_id RETURNING likes_count INTO v_new_count;
    RETURN jsonb_build_object('liked', true, 'likes_count', v_new_count);
  END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.increment_world_info_interaction_count(world_info_id uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE world_infos SET interaction_count = coalesce(interaction_count,0) + 1 WHERE id = world_info_id;
END;$$;

CREATE OR REPLACE FUNCTION public.decrement_world_info_interaction_count(world_info_id uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE world_infos SET interaction_count = GREATEST(coalesce(interaction_count,0) - 1, 0) WHERE id = world_info_id;
END;$$;

/* =============================================================
   MEMORIES
   ============================================================= */
CREATE OR REPLACE FUNCTION public.mark_memories_injected(mem_ids uuid[])
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO public
AS $$
  UPDATE public.character_memories
     SET injection_count = COALESCE(injection_count, 0) + 1,
         last_injected_at = now()
   WHERE id = ANY (mem_ids);
$$;

/* =============================================================
   ACCOUNT MANAGEMENT
   ============================================================= */
CREATE OR REPLACE FUNCTION public.delete_private_character(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE v_creator uuid; v_was_public boolean; v_visibility text; v_chat_id uuid; BEGIN
  SELECT creator_id, was_public, visibility INTO v_creator, v_was_public, v_visibility
  FROM public.characters WHERE id = p_character_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Character not found'; END IF;
  IF v_creator <> auth.uid() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_was_public THEN RAISE EXCEPTION 'Characters that have been public cannot be deleted'; END IF;
  IF v_visibility = 'public' THEN RAISE EXCEPTION 'Public characters cannot be deleted'; END IF;
  BEGIN DELETE FROM public.user_chat_context WHERE user_id = auth.uid() AND character_id = p_character_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.character_memories WHERE user_id = auth.uid() AND character_id = p_character_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  FOR v_chat_id IN SELECT id FROM public.chats WHERE user_id = auth.uid() AND character_id = p_character_id LOOP
    BEGIN PERFORM public.delete_chat_complete(v_chat_id, auth.uid());
    EXCEPTION WHEN undefined_function THEN
      DELETE FROM public.chats WHERE id = v_chat_id AND user_id = auth.uid();
    END;
  END LOOP;
  DELETE FROM public.characters WHERE id = p_character_id AND creator_id = auth.uid() AND was_public = false AND visibility <> 'public';
  IF NOT FOUND THEN RAISE EXCEPTION 'Character delete failed due to constraints'; END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, billing
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
END;$$;
COMMENT ON FUNCTION public.delete_user_account(uuid) IS 'Deletes user and associated billing/app records (must own).';

/* =============================================================
   MISC / UTIL
   ============================================================= */
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT auth.uid(); $$;

-- END OF FILE
