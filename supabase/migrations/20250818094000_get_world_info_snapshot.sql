-- get_world_info_snapshot RPC: bundles discovery world info data + user context
-- Inputs: p_user_id (nullable - if provided adds user specific flags), pagination controls
-- Returns: json with public list page, user_owned, user_favorited_ids, user_used_ids, tag_map, aggregated counts

create or replace function public.get_world_info_snapshot(p_user_id uuid, p_limit int default 24, p_offset int default 0)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public json;
  v_owned json;
  v_favorited_ids json;
  v_used_ids json;
  v_tag_map json;
  v_counts json;
  v_total int;
begin
  -- public page slice
  select json_agg(row_to_json(x)), count(*) over() into v_public, v_total
  from (
    select wi.id, wi.name, wi.short_description, wi.interaction_count, wi.created_at, wi.creator_id
    from world_infos wi
    where wi.visibility = 'public'
    order by wi.created_at desc
    offset p_offset limit p_limit
  ) x;

  -- owned by user (optional)
  if p_user_id is not null then
    select json_agg(row_to_json(o)) into v_owned
    from (
      select wi.id, wi.name, wi.short_description, wi.visibility, wi.created_at
      from world_infos wi
      where wi.creator_id = p_user_id
      order by wi.updated_at desc
      limit 100
    ) o;

    -- Favorites table not present in current schema; return empty until implemented
    v_favorited_ids := '[]'::json;

    select json_agg(row_to_json(u)) into v_used_ids
    from (
      select wiu.world_info_id as id
      from world_info_users wiu
      where wiu.user_id = p_user_id
    ) u;
  end if;

  -- tag map for all ids in current page
  with page_ids as (
    select (elem->>'id')::uuid as id from json_array_elements(coalesce(v_public,'[]'::json)) elem
  ), tags_join as (
    select wt.world_info_id, t.id as tag_id, t.name
    from world_info_tags wt
    join tags t on t.id = wt.tag_id
    join page_ids p on p.id = wt.world_info_id
  )
  select json_object_agg(world_info_id, tags) into v_tag_map
  from (
    select world_info_id, json_agg(json_build_object('id', tag_id, 'name', name)) as tags
    from tags_join
    group by world_info_id
  ) agg;

  -- aggregated counts per world info (likes, favorites placeholder=0, usage) for page
  with page_ids as (
    select (elem->>'id')::uuid as id from json_array_elements(coalesce(v_public,'[]'::json)) elem
  ), likes as (
    select world_info_id, count(*)::int c from world_info_user_likes where world_info_id in (select id from page_ids) group by world_info_id
  ), usage as (
    select world_info_id, count(*)::int c from world_info_users where world_info_id in (select id from page_ids) group by world_info_id
  )
  select json_object_agg(id, json_build_object('likes', coalesce(l.c,0), 'favorites', 0, 'usage', coalesce(u.c,0))) into v_counts
  from (
    select id from page_ids
  ) ids
  left join likes l on l.world_info_id = ids.id
  left join usage u on u.world_info_id = ids.id;

  return json_build_object(
    'public', coalesce(v_public,'[]'::json),
    'total', coalesce(v_total,0),
    'owned', coalesce(v_owned,'[]'::json),
    'favorited_ids', coalesce(v_favorited_ids,'[]'::json),
    'used_ids', coalesce(v_used_ids,'[]'::json),
    'tags', coalesce(v_tag_map, '{}'::json),
    'counts', coalesce(v_counts, '{}'::json)
  );
end;
$$;

comment on function public.get_world_info_snapshot(uuid,int,int) is 'Bundles world info discovery data + user context.';
