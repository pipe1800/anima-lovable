-- Security Phase 1 Hardening
-- Date: 2025-09-03
-- Goals (Advisor security warnings addressed):
--  * Lock deterministic search_path for SECURITY DEFINER functions (warning: function_search_path_mutable)
--  * (Non-breaking) – leave view definitions unchanged (public_profiles already not SECURITY DEFINER)
--  * Provide optional, commented guidance for moving extensions out of public (extension_in_public) – NOT executed automatically
--
-- Strategy:
-- 1. Iterate over all SECURITY DEFINER functions in schema public lacking an explicit search_path and set it to 'public'.
--    This avoids reliance on caller / global GUC state which Advisor flagged.
-- 2. Add explicit search_path only where absent (idempotent / safe to re-run).
-- 3. NO logic changes to function bodies; only configuration parameter applied via ALTER FUNCTION.
-- 4. Provide a report (NOTICE) for functions modified.
--
-- Rollback: (optional) Manually ALTER FUNCTION ... RESET search_path (not provided automatically here).
--
-- NOTE: If certain functions legitimately need other schemas (e.g., billing, auth), you should later
-- recreate those specific functions with: SET search_path = public, billing, auth  (in that order) once
-- validated. For now, we standardize to 'public' to eliminate mutable path risk quickly.

------------------------------
-- 1. Enforce search_path
------------------------------
DO $$
DECLARE
  r record;
  v_altered int := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
    v_altered := v_altered + 1;
    RAISE NOTICE 'Set search_path for %.%(%)', r.nspname, r.proname, r.args;
  END LOOP;
  RAISE NOTICE 'Security Phase 1: search_path hardened on % function(s).', v_altered;
END $$;

--------------------------------------------------------
-- 2. (Optional) Extension relocation guidance (comment)
--------------------------------------------------------
-- Supabase Advisor flagged: extension_in_public
-- To relocate extensions (example: pg_stat_statements) create a dedicated schema (e.g., ext)
-- and move the extension. This is NOT executed automatically to avoid surprises.
-- Uncomment & adjust only after verifying extension support for relocation.
--
-- BEGIN; -- optional transaction wrapper
-- CREATE SCHEMA IF NOT EXISTS ext;
-- -- Example for a relocatable extension:
-- -- ALTER EXTENSION pgcrypto SET SCHEMA ext;  -- (verify allowed; pgcrypto usually relocatable)
-- COMMIT;
--
-- After relocation you may REVOKE USAGE on ext from public if desired.

-- END Security Phase 1
