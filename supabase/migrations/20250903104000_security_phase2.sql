-- Security Phase 2
-- Date: 2025-09-03
-- Scope:
--  * Recreate public.public_profiles view plainly to clear erroneous security_definer_view advisory.
--  * Harden search_path for ALL remaining public functions (including non-SECURITY DEFINER) flagged as mutable.
--  * Idempotent: safe to re-run; skips already-hardened functions.
--
-- NOTE: We set search_path uniformly to 'public'. All functions reference fully-qualified objects or live in public.
-- If later a function truly needs other schemas in its path, recreate that specific function with
--   SET search_path = public, billing, auth
-- after validating dependency.

------------------------------
-- 1. Recreate public_profiles view
------------------------------
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
  SELECT 
    id,
    username,
    avatar_url,
    bio,
    created_at
  FROM public.profiles;
COMMENT ON VIEW public.public_profiles IS 'Safe public projection of profiles (no sensitive/internal columns). Prefer selecting from this view for directory listings.';
-- (Granting left explicit to infra decision)

------------------------------
-- 2. Harden mutable search_path (all public functions lacking explicit config)
------------------------------
DO $$
DECLARE
  r record;
  v_altered int := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, oidvectortypes(p.proargtypes) AS args, p.prosecdef,
           (SELECT bool_or(cfg LIKE 'search_path=%') FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg) AS has_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    IF NOT r.has_path THEN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
      v_altered := v_altered + 1;
      RAISE NOTICE 'Set search_path=public on %.%(%) (SECURITY DEFINER=%).', r.nspname, r.proname, r.args, r.prosecdef;
    END IF;
  END LOOP;
  RAISE NOTICE 'Security Phase 2: search_path hardened on % additional function(s).', v_altered;
END $$;

-- END Security Phase 2
