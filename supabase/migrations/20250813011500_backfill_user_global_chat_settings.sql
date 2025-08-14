-- Migration: Backfill user_global_chat_settings for existing users
-- Date: 2025-08-13

-- Temporarily disable RLS to allow backfill
ALTER TABLE public.user_global_chat_settings DISABLE ROW LEVEL SECURITY;

-- Insert settings rows for users missing one (defaults apply; addons OFF by default)
INSERT INTO public.user_global_chat_settings (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.user_global_chat_settings s ON s.user_id = u.id
WHERE s.user_id IS NULL;

-- Re-enable RLS
ALTER TABLE public.user_global_chat_settings ENABLE ROW LEVEL SECURITY;
