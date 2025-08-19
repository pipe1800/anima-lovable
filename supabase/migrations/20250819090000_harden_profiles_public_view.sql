-- Harden profiles exposure: replace blanket public SELECT with limited view
-- This migration creates a safe public view and tightens RLS on sensitive columns.
-- Safe to run repeatedly (IF EXISTS / DO NOTHING patterns) but assumes prior base schema.
-- IMPORTANT: Review before production if existing clients rely on direct public.profiles select.

-- 1. Create a reduced projection view for public consumption if not exists
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT 
    id,
    username,
    avatar_url,
    bio,
    created_at
  FROM public.profiles;

-- 2. Revoke overly broad policy if still present and replace with stricter ones
DO $$
BEGIN
  -- Drop blanket public policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'profiles' 
      AND policyname = 'Public profiles are viewable by everyone'
  ) THEN
    EXECUTE 'DROP POLICY "Public profiles are viewable by everyone" ON public.profiles';
  END IF;
END$$;

-- 3. Ensure RLS remains enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create replacement least-privilege policy (own row only) if absent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'profiles' 
      AND policyname = 'Users can select own full profile'
  ) THEN
    CREATE POLICY "Users can select own full profile" ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
END$$;

-- NOTE: Broad authenticated read was intentionally NOT recreated to enforce use of the view
-- for directory listings. Grant SELECT on public.public_profiles to anon/auth as needed externally.

-- 5. COMMENT to signal client code to migrate to view if broad access needed
COMMENT ON VIEW public.public_profiles IS 'Safe public projection of profiles (no sensitive/internal columns). Prefer selecting from this view for directory listings.';

-- 6. (Advisory) You may later GRANT SELECT ON public.public_profiles TO anon;
--   Keeping it explicit so infra can decide.
