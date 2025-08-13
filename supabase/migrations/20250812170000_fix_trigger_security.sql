-- Fix trigger functions to bypass RLS by running as SECURITY DEFINER
-- and ensure search_path is set to public to avoid function hijacking

create or replace function public.tg_characters_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.characters set likes_count = likes_count + 1
    where id = NEW.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters set likes_count = greatest(likes_count - 1, 0)
    where id = OLD.character_id;
  end if;
  return null;
end;$$;

create or replace function public.tg_characters_favorites_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.characters set favorites_count = favorites_count + 1
    where id = NEW.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters set favorites_count = greatest(favorites_count - 1, 0)
    where id = OLD.character_id;
  end if;
  return null;
end;$$;

create or replace function public.tg_characters_chats_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.characters set chats_count = chats_count + 1
    where id = NEW.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters set chats_count = greatest(chats_count - 1, 0)
    where id = OLD.character_id;
  end if;
  return null;
end;$$;

create or replace function public.tg_characters_messages_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.characters c
    set messages_count = messages_count + 1
    from public.chats ch
    where ch.id = NEW.chat_id and c.id = ch.character_id;
  elsif TG_OP = 'DELETE' then
    update public.characters c
    set messages_count = greatest(messages_count - 1, 0)
    from public.chats ch
    where ch.id = OLD.chat_id and c.id = ch.character_id;
  end if;
  return null;
end;$$;

-- Recreate triggers to ensure they bind to the latest function definitions
DO $$ BEGIN
  if exists (select 1 from pg_trigger where tgname = 'trg_characters_likes_count') then
    drop trigger trg_characters_likes_count on public.character_likes;
  end if;
  create trigger trg_characters_likes_count
    after insert or delete on public.character_likes
    for each row execute function public.tg_characters_likes_count();
END $$;

DO $$ BEGIN
  if exists (select 1 from pg_trigger where tgname = 'trg_characters_favorites_count') then
    drop trigger trg_characters_favorites_count on public.character_favorites;
  end if;
  create trigger trg_characters_favorites_count
    after insert or delete on public.character_favorites
    for each row execute function public.tg_characters_favorites_count();
END $$;

DO $$ BEGIN
  if exists (select 1 from pg_trigger where tgname = 'trg_characters_chats_count') then
    drop trigger trg_characters_chats_count on public.chats;
  end if;
  create trigger trg_characters_chats_count
    after insert or delete on public.chats
    for each row execute function public.tg_characters_chats_count();
END $$;

DO $$ BEGIN
  if exists (select 1 from pg_trigger where tgname = 'trg_characters_messages_count') then
    drop trigger trg_characters_messages_count on public.messages;
  end if;
  create trigger trg_characters_messages_count
    after insert or delete on public.messages
    for each row execute function public.tg_characters_messages_count();
END $$;

-- One-time corrective backfill to sync counters (safe if re-run)
update public.characters c
set likes_count = coalesce(x.likes, 0)
from (
  select character_id, count(*) as likes
  from public.character_likes
  group by character_id
) x
where x.character_id = c.id;

update public.characters c
set favorites_count = coalesce(x.favs, 0)
from (
  select character_id, count(*) as favs
  from public.character_favorites
  group by character_id
) x
where x.character_id = c.id;
