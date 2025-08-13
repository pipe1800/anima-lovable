-- Migration: Add global chat style settings and storage bucket for backgrounds
-- Date: 2025-08-13

-- Ensure required extension for UUID generation
create extension if not exists pgcrypto;

-- Helper function to auto-update updated_at
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create table if it does not exist
create table if not exists public.user_global_chat_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Addon settings
  dynamic_world_info boolean not null default false,
  enhanced_memory boolean not null default false,
  mood_tracking boolean not null default true,
  clothing_inventory boolean not null default true,
  location_tracking boolean not null default true,
  time_and_weather boolean not null default false,
  relationship_status boolean not null default false,
  character_position boolean not null default false,
  chain_of_thought boolean not null default false,
  few_shot_examples boolean not null default false,

  -- Streaming/accessibility
  streaming_mode text not null default 'smooth',
  font_size text not null default 'normal',

  -- Style settings
  ai_text_color text not null default '#E5E7EB',
  user_text_color text not null default '#FFFFFF',
  show_character_avatar boolean not null default true,
  show_user_avatar boolean not null default false,
  avatar_shape text not null default 'circle',
  avatar_size text not null default 'md',
  background_image_url text null,
  -- Bubble colors + opacity
  ai_bubble_color text not null default '#1f2937',
  ai_bubble_opacity numeric not null default 0.9,
  user_bubble_color text not null default '#FF7A00',
  user_bubble_opacity numeric not null default 1,
  -- Semantic highlighting
  semantic_overrides_mode text not null default 'default',
  speech_color text null,
  action_color text null,
  emphasis_color text null,
  parenthetical_color text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- Add missing columns safely (idempotent)
alter table public.user_global_chat_settings
  add column if not exists streaming_mode text not null default 'smooth';

alter table public.user_global_chat_settings
  add column if not exists font_size text not null default 'normal';

alter table public.user_global_chat_settings
  add column if not exists ai_text_color text not null default '#E5E7EB';

alter table public.user_global_chat_settings
  add column if not exists user_text_color text not null default '#FFFFFF';

alter table public.user_global_chat_settings
  add column if not exists show_character_avatar boolean not null default true;

alter table public.user_global_chat_settings
  add column if not exists show_user_avatar boolean not null default false;

alter table public.user_global_chat_settings
  add column if not exists avatar_shape text not null default 'circle';

alter table public.user_global_chat_settings
  add column if not exists avatar_size text not null default 'md';

alter table public.user_global_chat_settings
  add column if not exists background_image_url text null;

-- New bubble columns
alter table public.user_global_chat_settings
  add column if not exists ai_bubble_color text not null default '#1f2937';

alter table public.user_global_chat_settings
  add column if not exists ai_bubble_opacity numeric not null default 0.9;

alter table public.user_global_chat_settings
  add column if not exists user_bubble_color text not null default '#FF7A00';

alter table public.user_global_chat_settings
  add column if not exists user_bubble_opacity numeric not null default 1;

-- Semantic highlighting columns
alter table public.user_global_chat_settings
  add column if not exists semantic_overrides_mode text not null default 'default';

alter table public.user_global_chat_settings
  add column if not exists speech_color text null;

alter table public.user_global_chat_settings
  add column if not exists action_color text null;

alter table public.user_global_chat_settings
  add column if not exists emphasis_color text null;

alter table public.user_global_chat_settings
  add column if not exists parenthetical_color text null;

-- Optional: add basic value constraints if they don't exist yet
-- Note: We cannot easily reference existing constraint names; skip if column already has constraints.
-- Create new constraints only when absent by using dynamic SQL checks.

-- streaming_mode constraint (instant|smooth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_global_chat_settings' AND c.conname = 'user_global_chat_settings_streaming_mode_check'
  ) THEN
    ALTER TABLE public.user_global_chat_settings
      ADD CONSTRAINT user_global_chat_settings_streaming_mode_check
      CHECK (streaming_mode in ('instant','smooth'));
  END IF;
END $$;

-- font_size constraint (small|normal|large)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_global_chat_settings' AND c.conname = 'user_global_chat_settings_font_size_check'
  ) THEN
    ALTER TABLE public.user_global_chat_settings
      ADD CONSTRAINT user_global_chat_settings_font_size_check
      CHECK (font_size in ('small','normal','large'));
  END IF;
END $$;

-- avatar_shape constraint (circle|rounded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_global_chat_settings' AND c.conname = 'user_global_chat_settings_avatar_shape_check'
  ) THEN
    ALTER TABLE public.user_global_chat_settings
      ADD CONSTRAINT user_global_chat_settings_avatar_shape_check
      CHECK (avatar_shape in ('circle','rounded'));
  END IF;
END $$;

-- avatar_size constraint (sm|md|lg)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_global_chat_settings' AND c.conname = 'user_global_chat_settings_avatar_size_check'
  ) THEN
    ALTER TABLE public.user_global_chat_settings
      ADD CONSTRAINT user_global_chat_settings_avatar_size_check
      CHECK (avatar_size in ('sm','md','lg'));
  END IF;
END $$;

-- Bubble opacity constraints (0..1)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_global_chat_settings' AND c.conname = 'user_global_chat_settings_ai_bubble_opacity_check'
  ) THEN
    ALTER TABLE public.user_global_chat_settings
      ADD CONSTRAINT user_global_chat_settings_ai_bubble_opacity_check
      CHECK (ai_bubble_opacity >= 0 AND ai_bubble_opacity <= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_global_chat_settings' AND c.conname = 'user_global_chat_settings_user_bubble_opacity_check'
  ) THEN
    ALTER TABLE public.user_global_chat_settings
      ADD CONSTRAINT user_global_chat_settings_user_bubble_opacity_check
      CHECK (user_bubble_opacity >= 0 AND user_bubble_opacity <= 1);
  END IF;
END $$;

-- Constraint for semantic mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_global_chat_settings' AND c.conname = 'user_global_chat_settings_semantic_mode_check'
  ) THEN
    ALTER TABLE public.user_global_chat_settings
      ADD CONSTRAINT user_global_chat_settings_semantic_mode_check
      CHECK (semantic_overrides_mode in ('default','custom','disabled'));
  END IF;
END $$;

-- Trigger to auto-update updated_at on update
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'user_global_chat_settings_set_timestamp'
  ) THEN
    CREATE TRIGGER user_global_chat_settings_set_timestamp
    BEFORE UPDATE ON public.user_global_chat_settings
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();
  END IF;
END $$;

-- Storage: create public bucket for user backgrounds
DO $$
BEGIN
  -- Prefer using built-in helper if available
  PERFORM 1 FROM storage.buckets WHERE id = 'user-style';
  IF NOT FOUND THEN
    BEGIN
      PERFORM storage.create_bucket('user-style', public := true);
    EXCEPTION WHEN undefined_function THEN
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('user-style', 'user-style', true)
      ON CONFLICT (id) DO NOTHING;
    END;
  END IF;
END $$;

-- RLS Policies for storage.objects on 'user-style' bucket
-- Public read (bucket is public; this mirrors that behavior under RLS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'user_style_public_read'
  ) THEN
    CREATE POLICY "user_style_public_read"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'user-style');
  END IF;
END $$;

-- Authenticated users can insert/update/delete their own background objects under backgrounds/{uid}*
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'user_style_auth_insert'
  ) THEN
    CREATE POLICY "user_style_auth_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'user-style'
        AND (position(('backgrounds/' || auth.uid()::text) in name) = 1)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'user_style_auth_update'
  ) THEN
    CREATE POLICY "user_style_auth_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'user-style'
        AND (position(('backgrounds/' || auth.uid()::text) in name) = 1)
      )
      WITH CHECK (
        bucket_id = 'user-style'
        AND (position(('backgrounds/' || auth.uid()::text) in name) = 1)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'user_style_auth_delete'
  ) THEN
    CREATE POLICY "user_style_auth_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'user-style'
        AND (position(('backgrounds/' || auth.uid()::text) in name) = 1)
      );
  END IF;
END $$;
