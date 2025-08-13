-- Add denormalized counters to characters
alter table public.characters
  add column if not exists likes_count integer not null default 0,
  add column if not exists favorites_count integer not null default 0,
  add column if not exists chats_count integer not null default 0,
  add column if not exists messages_count integer not null default 0;

-- Unique indexes to prevent duplicate likes/favorites
create unique index if not exists idx_character_likes_unique
  on public.character_likes(character_id, user_id);
create unique index if not exists idx_character_favorites_unique
  on public.character_favorites(character_id, user_id);

-- Helpful indexes
create index if not exists idx_character_tags_tag_id on public.character_tags(tag_id);
create index if not exists idx_chats_character_id on public.chats(character_id);
create index if not exists idx_chats_user_id on public.chats(user_id);
create index if not exists idx_chats_character_last_message on public.chats(character_id, last_message_at desc);
create index if not exists idx_messages_chat_id on public.messages(chat_id);
create index if not exists idx_characters_visibility_interactions on public.characters(visibility, interaction_count desc);
create index if not exists idx_character_world_info_link_character_id on public.character_world_info_link(character_id);
create index if not exists idx_character_world_info_link_world_info_id on public.character_world_info_link(world_info_id);

-- Trigger functions for counters
create or replace function public.tg_characters_likes_count()
returns trigger language plpgsql as $$
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
returns trigger language plpgsql as $$
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
returns trigger language plpgsql as $$
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
returns trigger language plpgsql as $$
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

-- Triggers (drop if exists then create)
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

-- Backfill counters from existing data
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

update public.characters c
set chats_count = coalesce(x.chats, 0)
from (
  select character_id, count(*) as chats
  from public.chats
  group by character_id
) x
where x.character_id = c.id;

update public.characters c
set messages_count = coalesce(x.msgs, 0)
from (
  select ch.character_id, count(m.id) as msgs
  from public.messages m
  join public.chats ch on ch.id = m.chat_id
  group by ch.character_id
) x
where x.character_id = c.id;

-- Character profile view with flattened joins
create or replace view public.character_profile_view as
select
  c.id,
  c.name,
  c.short_description,
  c.avatar_url,
  c.visibility,
  c.interaction_count,
  c.created_at,
  c.updated_at,
  c.tagline,
  c.creator_id,
  c.likes_count,
  c.favorites_count,
  c.chats_count,
  c.messages_count,
  jsonb_build_object(
    'greeting', cd.greeting,
    'description', cd.description,
    'personality_summary', cd.personality_summary,
    'scenario', cd.scenario,
    'model_id', cd.model_id
  ) as character_definitions,
  jsonb_build_object(
    'username', p.username,
    'avatar_url', p.avatar_url
  ) as creator,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from (
        select distinct t.id, t.name
        from public.character_tags ct
        join public.tags t on t.id = ct.tag_id
        where ct.character_id = c.id
      ) s
    ), '[]'::jsonb
  ) as tags,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'short_description', s.short_description) order by s.name)
      from (
        select distinct w.id, w.name, w.short_description
        from public.character_world_info_link cwil
        join public.world_infos w on w.id = cwil.world_info_id
        where cwil.character_id = c.id
      ) s
    ), '[]'::jsonb
  ) as world_infos
from public.characters c
left join public.character_definitions cd on cd.character_id = c.id
left join public.profiles p on p.id = c.creator_id;

-- Related characters RPC
create or replace function public.related_characters(current_character_id uuid, tag_ids int[])
returns table (
  id uuid,
  name text,
  avatar_url text,
  short_description text,
  likes_count integer,
  chats_count integer,
  creator jsonb,
  tags jsonb
) language plpgsql as $$
begin
  if tag_ids is null or array_length(tag_ids, 1) is null then
    return query
    select
      c.id,
      c.name,
      c.avatar_url,
      c.short_description,
      c.likes_count,
      c.chats_count,
      jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) as creator,
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
          from (
            select distinct t.id, t.name
            from public.character_tags ct
            join public.tags t on t.id = ct.tag_id
            where ct.character_id = c.id
          ) s
        ), '[]'::jsonb
      ) as tags
    from public.characters c
    left join public.profiles p on p.id = c.creator_id
    where c.visibility = 'public' and c.id <> current_character_id
    order by c.chats_count desc, c.likes_count desc
    limit 10;
  else
    return query
    with related as (
      select ct.character_id, count(*) as overlap
      from public.character_tags ct
      where ct.tag_id = any(tag_ids) and ct.character_id <> current_character_id
      group by ct.character_id
    )
    select
      c.id,
      c.name,
      c.avatar_url,
      c.short_description,
      c.likes_count,
      c.chats_count,
      jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) as creator,
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
          from (
            select distinct t.id, t.name
            from public.character_tags ct2
            join public.tags t on t.id = ct2.tag_id
            where ct2.character_id = c.id
          ) s
        ), '[]'::jsonb
      ) as tags
    from related r
    join public.characters c on c.id = r.character_id
    left join public.profiles p on p.id = c.creator_id
    where c.visibility = 'public'
    order by r.overlap desc, c.chats_count desc, c.likes_count desc
    limit 10;
  end if;
end;$$;
