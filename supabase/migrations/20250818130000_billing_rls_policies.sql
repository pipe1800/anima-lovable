-- Billing RLS Policies (ensure snapshot can see subscription & credits)
-- Idempotent: checks existence before creating policies.

-- Enable RLS (safe if already enabled)
ALTER TABLE billing.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscriptions ENABLE ROW LEVEL SECURITY;

-- Credits policies ----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='credits' AND policyname='credits_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY credits_select_own ON billing.credits FOR SELECT USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='credits' AND policyname='credits_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY credits_update_own ON billing.credits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='credits' AND policyname='credits_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY credits_insert_own ON billing.credits FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Subscriptions policies ----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='subscriptions' AND policyname='subscriptions_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY subscriptions_select_own ON billing.subscriptions FOR SELECT USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='subscriptions' AND policyname='subscriptions_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY subscriptions_update_own ON billing.subscriptions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='subscriptions' AND policyname='subscriptions_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY subscriptions_insert_own ON billing.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Optional: Allow deleting own (unlikely needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='subscriptions' AND policyname='subscriptions_delete_own'
  ) THEN
    EXECUTE 'CREATE POLICY subscriptions_delete_own ON billing.subscriptions FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- Grant basic privileges (RLS still applies)
GRANT SELECT, INSERT, UPDATE, DELETE ON billing.credits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON billing.subscriptions TO authenticated;
