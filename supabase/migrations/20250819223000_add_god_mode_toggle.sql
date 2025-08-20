-- Migration: Add god_mode toggle to global chat settings
-- Date: 2025-08-19

alter table public.user_global_chat_settings
  add column if not exists god_mode boolean not null default false;

-- Backfill existing rows explicitly (idempotent)
update public.user_global_chat_settings set god_mode = coalesce(god_mode, false) where god_mode is null;
