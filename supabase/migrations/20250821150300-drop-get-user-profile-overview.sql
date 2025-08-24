-- Migration: Drop deprecated get_user_profile_overview RPC
-- Created: 2025-08-21
-- Preconditions: New get_user_bootstrap (with counts) & get_public_profile_overview deployed, client code migrated.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_profile_overview'
      AND pg_get_function_identity_arguments(p.oid) = 'p_target_user_id uuid, p_viewer_user_id uuid, p_include_personas boolean'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_user_profile_overview(p_target_user_id uuid, p_viewer_user_id uuid, p_include_personas boolean)';
  END IF;
END$$;

COMMIT;
