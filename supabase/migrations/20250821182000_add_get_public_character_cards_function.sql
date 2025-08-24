-- Migration: add get_public_character_cards RPC
-- Purpose: Consolidated, secure, efficient public character listing & search
-- Security: SECURITY INVOKER so RLS on underlying tables still enforced.
-- Only public characters (visibility = 'public') are returned.
-- NSFW exclusion enforced when p_include_nsfw = false (tag id 24).
-- Input sanitization: p_search is trimmed; wildcards not injected dynamically.
-- Tag filtering: OR semantics (character must have at least one of provided tag IDs).
-- Sorting constrained via CASE expressions to avoid SQL injection.
-- Limit & offset clamped to safe bounds.

create or replace function public.get_public_character_cards(
  p_search text default null,
  p_sort text default 'popular',          -- 'popular' | 'newest' | 'conversations'
  p_tag_ids int[] default null,           -- list of tag ids (OR semantics)
  p_creator_username text default null,   -- partial match (ilike)
  p_include_nsfw boolean default true,    -- false excludes tag id 24
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid,
  name text,
  short_description text,
  avatar_url text,
  interaction_count integer,
  created_at timestamptz,
  creator_id uuid,
  likes_count integer,
  favorites_count integer,
  chats_count integer,
  creator jsonb,
  tags jsonb[],
  total_count bigint
) language sql stable security invoker as $$
  with params as (
    select 
      nullif(trim(p_search), '') as q,
      case when p_limit between 1 and 100 then p_limit else 20 end as q_limit,
      case when p_offset >= 0 then p_offset else 0 end as q_offset,
      lower(p_sort) as sort_key
  ), base as (
    select c.id,
           c.name,
           c.short_description,
           c.avatar_url,
           c.interaction_count,
           c.created_at,
           c.creator_id,
           c.likes_count,
           c.favorites_count,
           c.chats_count,
           jsonb_build_object(
             'id', prof.id,
             'username', prof.username,
             'avatar_url', prof.avatar_url
           ) as creator,
           (
             select coalesce(array_agg(distinct jsonb_build_object('id', t.id, 'name', t.name)) filter (where t.id is not null), '{}')
             from character_tags ct
             join tags t on t.id = ct.tag_id
             where ct.character_id = c.id
           ) as tags
    from characters c
    join public_profiles prof on prof.id = c.creator_id
    cross join params p
    where c.visibility = 'public'
      and (
        p.q is null
        or (c.name ilike '%' || p.q || '%'
            or c.short_description ilike '%' || p.q || '%')
      )
      and (
        p_creator_username is null
        or prof.username ilike '%' || p_creator_username || '%'
      )
      and (
        p_include_nsfw
        or not exists (
          select 1 from character_tags nsfw
          where nsfw.character_id = c.id and nsfw.tag_id = 24
        )
      )
      and (
        p_tag_ids is null
        or exists (
          select 1 from character_tags f
          where f.character_id = c.id and f.tag_id = any(p_tag_ids)
        )
      )
  ), ordered as (
    select b.*, count(*) over() as total_count,
      row_number() over(
        order by
          case when (select sort_key from params) = 'newest' then b.created_at end desc,
          case when (select sort_key from params) = 'conversations' then b.chats_count end desc,
          case when (select sort_key from params) not in ('newest','conversations') then b.interaction_count end desc,
          b.id
      ) as rn
    from base b
  )
  select id, name, short_description, avatar_url, interaction_count, created_at, creator_id,
         likes_count, favorites_count, chats_count, creator, tags, total_count
  from ordered o
  cross join params p
  where o.rn > p.q_offset and o.rn <= p.q_offset + p.q_limit
  order by o.rn;
$$;

comment on function public.get_public_character_cards is 'Unified public character listing/search with sorting, tag filter, creator filter, NSFW exclusion, pagination.';

-- Permissions: allow read-only execution to anon & authenticated (function relies on RLS of underlying tables)
revoke all on function public.get_public_character_cards(text, text, int[], text, boolean, int, int) from public;
grant execute on function public.get_public_character_cards(text, text, int[], text, boolean, int, int) to anon, authenticated;
