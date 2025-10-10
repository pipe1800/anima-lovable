-- Migration: update get_user_dashboard_overview to use user_reactions table
-- Context: character_favorites and character_likes tables were removed in schema_update.sql
-- This migration refreshes the RPC to reference consolidated user_reactions data.

set check_function_bodies = off;

drop function if exists public.get_user_dashboard_overview(uuid, integer, integer);

create or replace function public.get_user_dashboard_overview(
  p_user_id uuid,
  p_chars_limit integer default 30,
  p_favs_limit integer default 30
) returns json
language plpgsql
security definer
set search_path = 'public', 'billing', 'auth'
as $$
declare
  v_chars jsonb := '[]'::jsonb;
  v_favs jsonb := '[]'::jsonb;
  v_liked_ids jsonb := '[]'::jsonb;
  v_counts jsonb;
begin
  perform public._assert_self(p_user_id);

  with user_chars as (
    select c.id,
           c.name,
           c.avatar_url,
           c.visibility,
           c.likes_count,
           c.chats_count,
           c.tagline,
           c.updated_at
      from characters c
     where c.creator_id = p_user_id
     order by c.updated_at desc nulls last
     limit greatest(p_chars_limit, 0)
  ), fav_ids as (
    select ur.target_id as character_id,
           ur.created_at
      from public.user_reactions ur
     where ur.user_id = p_user_id
       and ur.target_type = 'character'
       and ur.reaction_type = 'favorite'
     order by ur.created_at desc
     limit greatest(p_favs_limit, 0)
  ), fav_chars as (
    select c.id,
           c.name,
           c.avatar_url,
           c.visibility,
           c.likes_count,
           c.chats_count,
           c.tagline,
           f.created_at as favorited_at
      from characters c
      join fav_ids f on f.character_id = c.id
     where c.visibility = 'public'
  ), liked as (
    select ur.target_id as character_id
      from public.user_reactions ur
     where ur.user_id = p_user_id
       and ur.target_type = 'character'
       and ur.reaction_type = 'like'
       and ur.target_id in (
         select id from user_chars
         union
         select id from fav_chars
       )
  )
  select coalesce((select jsonb_agg(to_jsonb(u.*)) from user_chars u), '[]'::jsonb),
         coalesce((select jsonb_agg(to_jsonb(f.*)) from fav_chars f), '[]'::jsonb),
         coalesce((select jsonb_agg(to_jsonb(l.character_id)) from liked l), '[]'::jsonb)
    into v_chars, v_favs, v_liked_ids;

  select jsonb_build_object(
           'characters', (select count(*) from characters where creator_id = p_user_id),
           'favorites',  (select count(*)
                          from public.user_reactions ur
                         where ur.user_id = p_user_id
                           and ur.target_type = 'character'
                           and ur.reaction_type = 'favorite'),
           'chats',      (select count(*) from chats where user_id = p_user_id),
           'personas',   (select count(*) from personas where user_id = p_user_id)
         )
    into v_counts;

  return json_build_object(
    'characters', v_chars,
    'favorites', v_favs,
    'liked_ids', v_liked_ids,
    'counts', v_counts
  );
end;
$$;

grant execute on function public.get_user_dashboard_overview(uuid, integer, integer) to authenticated;
grant execute on function public.get_user_dashboard_overview(uuid, integer, integer) to service_role;

select pg_notify('pgrst', 'reload schema');

set check_function_bodies = on;
