-- Ensure unique constraints to prevent duplicate like/favorite rows per user/character
alter table public.character_likes add constraint if not exists character_likes_unique unique (character_id, user_id);
alter table public.character_favorites add constraint if not exists character_favorites_unique unique (character_id, user_id);

-- Like counter increment
create or replace function public.inc_character_likes() returns trigger language plpgsql as $$
begin
  update public.characters set likes_count = coalesce(likes_count,0) + 1 where id = NEW.character_id;
  return NEW;
end;$$;

-- Like counter decrement
create or replace function public.dec_character_likes() returns trigger language plpgsql as $$
begin
  update public.characters set likes_count = greatest(coalesce(likes_count,0) - 1,0) where id = OLD.character_id;
  return OLD;
end;$$;

-- Favorite counter increment
create or replace function public.inc_character_favorites() returns trigger language plpgsql as $$
begin
  update public.characters set favorites_count = coalesce(favorites_count,0) + 1 where id = NEW.character_id;
  return NEW;
end;$$;

-- Favorite counter decrement
create or replace function public.dec_character_favorites() returns trigger language plpgsql as $$
begin
  update public.characters set favorites_count = greatest(coalesce(favorites_count,0) - 1,0) where id = OLD.character_id;
  return OLD;
end;$$;

-- Drop existing triggers if any to avoid duplicates
drop trigger if exists trg_character_likes_inc on public.character_likes;
drop trigger if exists trg_character_likes_dec on public.character_likes;
drop trigger if exists trg_character_favorites_inc on public.character_favorites;
drop trigger if exists trg_character_favorites_dec on public.character_favorites;

-- Create new triggers
create trigger trg_character_likes_inc after insert on public.character_likes for each row execute function public.inc_character_likes();
create trigger trg_character_likes_dec after delete on public.character_likes for each row execute function public.dec_character_likes();
create trigger trg_character_favorites_inc after insert on public.character_favorites for each row execute function public.inc_character_favorites();
create trigger trg_character_favorites_dec after delete on public.character_favorites for each row execute function public.dec_character_favorites();

-- Backfill counts to ensure correctness
update public.characters c set likes_count = sub.cnt from (
  select character_id, count(*) cnt from public.character_likes group by 1
) sub where c.id = sub.character_id;
update public.characters set likes_count = 0 where likes_count is null;

update public.characters c set favorites_count = sub.cnt from (
  select character_id, count(*) cnt from public.character_favorites group by 1
) sub where c.id = sub.character_id;
update public.characters set favorites_count = 0 where favorites_count is null;

-- Comment: These triggers keep likes_count and favorites_count in sync immediately after like/favorite operations.
