-- get_user_snapshot RPC: returns consolidated user dashboard data
-- Safe for authenticated user only (enforces user id match via SECURITY DEFINER + RLS checks inside)
-- Includes: profile (private), subscription+plan, credits balance, counts (characters, chats, favorites),
-- lightweight character summaries, personas list.

create or replace function public.get_user_snapshot(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile json;
  v_subscription json;
  v_credits int;
  v_characters json;
  v_personas json;
  v_counts json;
  v_favorites_count int;
  v_chats_count int;
begin
  -- Basic auth check (ensure caller is same user)
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;

  select to_jsonb(p) into v_profile
  from profiles p
  where p.id = p_user_id;

  select to_jsonb(s) into v_subscription
  from subscriptions s
  where s.user_id = p_user_id
  order by s.created_at desc
  limit 1;

  select balance into v_credits
  from credits
  where user_id = p_user_id;

  select count(*) into v_favorites_count
  from character_favorites cf
  join characters c on c.id = cf.character_id and c.visibility = 'public'
  where cf.user_id = p_user_id;

  select count(*) into v_chats_count
  from chats ch
  where ch.user_id = p_user_id;

  select json_agg(row_to_json(x)) into v_characters
  from (
    select c.id, c.name, c.short_description, c.avatar_url, c.visibility,
           c.interaction_count, c.created_at, c.updated_at
    from characters c
    where c.creator_id = p_user_id
    order by c.updated_at desc
    limit 100 -- safety cap
  ) x;

  select json_agg(row_to_json(pn)) into v_personas
  from personas pn
  where pn.user_id = p_user_id
  order by pn.updated_at desc
  limit 100;

  v_counts := json_build_object(
    'favorites', coalesce(v_favorites_count,0),
    'chats', coalesce(v_chats_count,0),
    'characters', coalesce(json_array_length(coalesce(v_characters, '[]'::json)),0),
    'personas', coalesce(json_array_length(coalesce(v_personas, '[]'::json)),0)
  );

  return json_build_object(
    'profile', v_profile,
    'subscription', v_subscription,
    'credits', coalesce(v_credits,0),
    'counts', v_counts,
    'characters', coalesce(v_characters,'[]'::json),
    'personas', coalesce(v_personas,'[]'::json)
  );
end;
$$;

comment on function public.get_user_snapshot(uuid) is 'Returns consolidated user data for dashboard/prefetch.';
