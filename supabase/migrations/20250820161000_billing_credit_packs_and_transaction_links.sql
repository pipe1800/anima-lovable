-- Migration: Introduce credit packs into billing schema and extend transactions table
-- Date: 2025-08-20
-- Goal:
--   1. Create billing.credit_packs & billing.credit_pack_purchases (canonical versions of public.*)
--   2. Extend billing.transactions to explicitly link either a subscription or a credit pack purchase
--   3. Migrate existing public credit packs & purchases into billing schema
--   4. Create transaction rows for historical credit pack purchases
--   5. Add RLS policies for new tables
-- Idempotent: guarded with IF NOT EXISTS / ON CONFLICT logic so it can be re-run safely.

BEGIN;

--------------------------------------------------------------------------------
-- 0. New ENUM types (if not already present)
--------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'transaction_purchase_type' AND n.nspname = 'billing'
  ) THEN
    CREATE TYPE billing.transaction_purchase_type AS ENUM ('subscription','credit_pack');
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 1. Create billing.credit_packs (canonical)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.credit_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0), -- store in minor units
  credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE billing.credit_packs IS 'One-time purchasable credit bundles (canonical).';

-- Index for active listing
CREATE INDEX IF NOT EXISTS idx_billing_credit_packs_active ON billing.credit_packs(is_active);

--------------------------------------------------------------------------------
-- 2. Create billing.credit_pack_purchases
--------------------------------------------------------------------------------
-- NOTE: Public schema has migrated to PayPal naming (paypal_order_id). We mirror that.
CREATE TABLE IF NOT EXISTS billing.credit_pack_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_pack_id UUID NOT NULL REFERENCES billing.credit_packs(id),
  paypal_order_id TEXT UNIQUE, -- gateway order / transaction id (PayPal)
  amount_paid_cents INTEGER NOT NULL CHECK (amount_paid_cents >= 0),
  credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE billing.credit_pack_purchases IS 'Tracks individual user purchases of credit packs.';
CREATE INDEX IF NOT EXISTS idx_billing_credit_pack_purchases_user ON billing.credit_pack_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_credit_pack_purchases_pack ON billing.credit_pack_purchases(credit_pack_id);
CREATE INDEX IF NOT EXISTS idx_billing_credit_pack_purchases_status ON billing.credit_pack_purchases(status);

--------------------------------------------------------------------------------
-- 3. Extend billing.transactions to link to subscription or credit pack purchase
--------------------------------------------------------------------------------
-- Add columns if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='billing' AND table_name='transactions' AND column_name='purchase_type'
  ) THEN
    ALTER TABLE billing.transactions
      ADD COLUMN purchase_type billing.transaction_purchase_type;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='billing' AND table_name='transactions' AND column_name='subscription_id'
  ) THEN
    ALTER TABLE billing.transactions
      ADD COLUMN subscription_id UUID REFERENCES billing.subscriptions(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='billing' AND table_name='transactions' AND column_name='credit_pack_purchase_id'
  ) THEN
    ALTER TABLE billing.transactions
      ADD COLUMN credit_pack_purchase_id UUID REFERENCES billing.credit_pack_purchases(id);
  END IF;
END $$;

-- Add partial integrity constraint (only enforced when purchase_type is set)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='transactions_purchase_type_integrity'
  ) THEN
    ALTER TABLE billing.transactions
      ADD CONSTRAINT transactions_purchase_type_integrity CHECK (
        purchase_type IS NULL OR (
          (purchase_type = 'subscription' AND subscription_id IS NOT NULL AND credit_pack_purchase_id IS NULL) OR
          (purchase_type = 'credit_pack' AND credit_pack_purchase_id IS NOT NULL AND subscription_id IS NULL)
        )
      );
  END IF;
END $$;

-- Helpful index for filtering by purchase type
CREATE INDEX IF NOT EXISTS idx_billing_transactions_purchase_type ON billing.transactions(purchase_type);

--------------------------------------------------------------------------------
-- 4. RLS Policies for new tables (mirroring existing public access patterns)
--------------------------------------------------------------------------------
ALTER TABLE billing.credit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.credit_pack_purchases ENABLE ROW LEVEL SECURITY;

-- Public (active) credit packs viewable; keep selection limited to active ones
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p JOIN pg_class c ON p.tablename=c.relname
     JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE p.policyname='billing_credit_packs_select' AND n.nspname='billing'
  ) THEN
    CREATE POLICY billing_credit_packs_select ON billing.credit_packs FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- Users can view their own purchases
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p JOIN pg_class c ON p.tablename=c.relname
     JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE p.policyname='billing_credit_pack_purchases_select' AND n.nspname='billing'
  ) THEN
    CREATE POLICY billing_credit_pack_purchases_select ON billing.credit_pack_purchases
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

-- (Optional) Allow users to insert their own purchase placeholder rows (service role typically handles inserts)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p JOIN pg_class c ON p.tablename=c.relname
     JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE p.policyname='billing_credit_pack_purchases_insert' AND n.nspname='billing'
  ) THEN
    CREATE POLICY billing_credit_pack_purchases_insert ON billing.credit_pack_purchases
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

--------------------------------------------------------------------------------
-- 5. Data Migration: Copy public credit_packs -> billing.credit_packs
--------------------------------------------------------------------------------
-- We preserve original UUIDs to simplify referencing. Convert price (NUMERIC) to cents.
INSERT INTO billing.credit_packs (id, name, price_cents, credits_granted, description, is_active, created_at)
SELECT p.id, p.name, (p.price * 100)::int, p.credits_granted, p.description, p.is_active, p.created_at
FROM public.credit_packs p
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  credits_granted = EXCLUDED.credits_granted,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active
WHERE (
  billing.credit_packs.name IS DISTINCT FROM EXCLUDED.name OR
  billing.credit_packs.price_cents IS DISTINCT FROM EXCLUDED.price_cents OR
  billing.credit_packs.credits_granted IS DISTINCT FROM EXCLUDED.credits_granted OR
  billing.credit_packs.description IS DISTINCT FROM EXCLUDED.description OR
  billing.credit_packs.is_active IS DISTINCT FROM EXCLUDED.is_active
);

--------------------------------------------------------------------------------
-- 6. Data Migration: Copy public.credit_pack_purchases -> billing.credit_pack_purchases
--------------------------------------------------------------------------------
INSERT INTO billing.credit_pack_purchases (
  id, user_id, credit_pack_id, paypal_order_id, amount_paid_cents,
  credits_granted, status, created_at
)
SELECT cpp.id, cpp.user_id, cpp.credit_pack_id, cpp.paypal_order_id,
       (cpp.amount_paid * 100)::int, cpp.credits_granted,
       cpp.status, cpp.created_at
FROM public.credit_pack_purchases cpp
ON CONFLICT (id) DO UPDATE SET
  paypal_order_id = EXCLUDED.paypal_order_id,
  amount_paid_cents = EXCLUDED.amount_paid_cents,
  credits_granted = EXCLUDED.credits_granted,
  status = EXCLUDED.status
WHERE (
  billing.credit_pack_purchases.paypal_order_id IS DISTINCT FROM EXCLUDED.paypal_order_id OR
  billing.credit_pack_purchases.amount_paid_cents IS DISTINCT FROM EXCLUDED.amount_paid_cents OR
  billing.credit_pack_purchases.credits_granted IS DISTINCT FROM EXCLUDED.credits_granted OR
  billing.credit_pack_purchases.status IS DISTINCT FROM EXCLUDED.status
);

--------------------------------------------------------------------------------
-- 7. Create transactions for historical credit pack purchases (if not already linked)
--------------------------------------------------------------------------------
INSERT INTO billing.transactions (
  user_id, gateway, gateway_transaction_id, amount, currency, status,
  purchase_type, credit_pack_purchase_id, created_at
)
SELECT
  cpp.user_id,
  'paypal'::billing.gateway_type,
  cpp.paypal_order_id,
  cpp.amount_paid_cents,
  'usd',
  CASE cpp.status
    WHEN 'completed' THEN 'succeeded'
    WHEN 'failed' THEN 'failed'
    ELSE 'pending'
  END::billing.transaction_status,
  'credit_pack'::billing.transaction_purchase_type,
  cpp.id,
  cpp.created_at
FROM billing.credit_pack_purchases cpp
LEFT JOIN billing.transactions t ON t.credit_pack_purchase_id = cpp.id
WHERE t.id IS NULL;

-- Note: Existing subscription-related transactions (if any) can be backfilled later by
-- updating subscription_id + purchase_type='subscription'. This migration does not attempt
-- to infer those links automatically.

--------------------------------------------------------------------------------
-- 8. Comments / Documentation for new columns
--------------------------------------------------------------------------------
COMMENT ON COLUMN billing.transactions.purchase_type IS 'Indicates whether the transaction is for a subscription or a credit pack.';
COMMENT ON COLUMN billing.transactions.subscription_id IS 'FK to billing.subscriptions when purchase_type=subscription';
COMMENT ON COLUMN billing.transactions.credit_pack_purchase_id IS 'FK to billing.credit_pack_purchases when purchase_type=credit_pack';

COMMIT;

-- Post-migration TODOs:
--  * Update application code to query billing.credit_packs instead of public.credit_packs
--  * Route new credit pack purchases to create a transaction row (with purchase_type=credit_pack) then ledger entry
--  * Eventually deprecate public.credit_packs & public.credit_pack_purchases (replace with views or drop)
