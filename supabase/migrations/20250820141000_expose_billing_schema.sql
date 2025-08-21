-- Migration: Expose billing schema to Supabase API
-- Date: 2025-08-20
-- Purpose: Grant necessary permissions for billing schema to be accessible via PostgREST API

BEGIN;

-- Grant usage on the billing schema to anon and authenticated roles
GRANT USAGE ON SCHEMA billing TO anon, authenticated;

-- Grant SELECT permissions on all tables in billing schema
GRANT SELECT ON ALL TABLES IN SCHEMA billing TO anon, authenticated;

-- Grant permissions on specific tables that users need to access
GRANT SELECT ON billing.credits TO anon, authenticated;
GRANT SELECT ON billing.plans TO anon, authenticated;
GRANT SELECT ON billing.subscriptions TO anon, authenticated;
GRANT SELECT ON billing.credit_pack_purchases TO anon, authenticated;

-- Allow authenticated users to insert/update their own billing records
-- (You may want to restrict this further based on your RLS policies)
GRANT INSERT, UPDATE ON billing.credits TO authenticated;
GRANT INSERT ON billing.subscriptions TO authenticated;
GRANT INSERT ON billing.credit_pack_purchases TO authenticated;

-- Ensure future tables in billing schema are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT INSERT, UPDATE ON TABLES TO authenticated;

COMMIT;
