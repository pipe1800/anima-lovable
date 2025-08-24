-- Migration: fix_credit_functions_enum_cast
-- Purpose: Ensure credit ledger writes cast mapped text labels to credit_transaction_type enum
-- Security: Keeps SECURITY DEFINER and ownership checks via public._assert_self
-- Efficiency: No logic change aside from explicit enum cast; plan unaffected

BEGIN;

-- Recreate add_user_credits with explicit enum cast
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

COMMENT ON FUNCTION public.add_user_credits(uuid,integer,text,uuid) IS 'Grant credits with enum-safe casting; maps labels and caps only subscription_allowance/initial_grant.';

-- Recreate deduct_user_credits with explicit enum cast
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

COMMENT ON FUNCTION public.deduct_user_credits(uuid,integer,text,text) IS 'Deduct credits with enum-safe casting; returns new balance or NULL if insufficient.';

COMMIT;
