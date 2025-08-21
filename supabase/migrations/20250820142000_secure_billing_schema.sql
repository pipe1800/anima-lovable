-- Migration: Secure billing schema permissions
-- Date: 2025-08-20
-- Purpose: Grant minimal necessary permissions for billing schema with proper security

BEGIN;

-- Revoke any overly broad permissions from previous migration
REVOKE INSERT, UPDATE ON billing.credits FROM authenticated;
REVOKE INSERT ON billing.subscriptions FROM authenticated;
REVOKE INSERT ON billing.credit_pack_purchases FROM authenticated;

-- Grant only read access to billing tables for authenticated users
-- Write operations should be handled by secure server-side functions
GRANT USAGE ON SCHEMA billing TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA billing TO anon, authenticated;

-- Specific table permissions (read-only for users)
GRANT SELECT ON billing.credits TO anon, authenticated;
GRANT SELECT ON billing.plans TO anon, authenticated;
GRANT SELECT ON billing.subscriptions TO anon, authenticated;
GRANT SELECT ON billing.credit_pack_purchases TO anon, authenticated;

-- Ensure RLS is enabled on all billing tables
ALTER TABLE billing.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.credit_pack_purchases ENABLE ROW LEVEL SECURITY;
-- Note: billing.plans doesn't need RLS as it's public data

-- Create secure RLS policies for user data access
-- Users can only see their own credits
CREATE POLICY "Users can view own credits" ON billing.credits
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only see their own subscriptions  
CREATE POLICY "Users can view own subscriptions" ON billing.subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only see their own purchases
CREATE POLICY "Users can view own purchases" ON billing.credit_pack_purchases
    FOR SELECT USING (auth.uid() = user_id);

-- Plans are public (no RLS needed as they're reference data)
-- But let's ensure everyone can read them
CREATE POLICY "Plans are publicly readable" ON billing.plans
    FOR SELECT USING (true);

-- Ensure future tables are read-only by default
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT SELECT ON TABLES TO anon, authenticated;

COMMIT;
