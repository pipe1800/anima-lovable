-- Migration: Set addon defaults OFF, add RLS, and seed settings on signup
-- Date: 2025-08-13

-- 1) Ensure addon defaults are OFF for new rows
ALTER TABLE public.user_global_chat_settings
  ALTER COLUMN mood_tracking SET DEFAULT false,
  ALTER COLUMN clothing_inventory SET DEFAULT false,
  ALTER COLUMN location_tracking SET DEFAULT false,
  ALTER COLUMN time_and_weather SET DEFAULT false,
  ALTER COLUMN relationship_status SET DEFAULT false,
  ALTER COLUMN character_position SET DEFAULT false,
  ALTER COLUMN dynamic_world_info SET DEFAULT false,
  ALTER COLUMN enhanced_memory SET DEFAULT false;

-- 2) Enable RLS and add owner-only policies (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_global_chat_settings' AND c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE public.user_global_chat_settings ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Drop existing policies if they exist (avoid duplicates on re-run)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_global_chat_settings' AND policyname = 'user_global_chat_settings_select_own'
  ) THEN
    EXECUTE 'DROP POLICY user_global_chat_settings_select_own ON public.user_global_chat_settings';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_global_chat_settings' AND policyname = 'user_global_chat_settings_modify_own'
  ) THEN
    EXECUTE 'DROP POLICY user_global_chat_settings_modify_own ON public.user_global_chat_settings';
  END IF;
END $$;

-- Create policies
CREATE POLICY user_global_chat_settings_select_own
  ON public.user_global_chat_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_global_chat_settings_modify_own
  ON public.user_global_chat_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_global_chat_settings_update_own
  ON public.user_global_chat_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_global_chat_settings_delete_own
  ON public.user_global_chat_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3) Create a signup trigger to seed a row with defaults (OFF by default)
CREATE OR REPLACE FUNCTION public.handle_new_user_global_settings()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert a row for the new user with default values (defaults enforce OFF)
  INSERT INTO public.user_global_chat_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a separate trigger for seeding global chat settings on user creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_global_settings'
  ) THEN
    CREATE TRIGGER on_auth_user_created_global_settings
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_global_settings();
  END IF;
END $$;
