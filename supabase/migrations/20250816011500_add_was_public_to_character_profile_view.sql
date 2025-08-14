-- Add was_public to character_profile_view
create or replace view public.character_profile_view as
select
  c.id,
  c.name,
  c.short_description,
  c.avatar_url,
  c.visibility,
  c.was_public,
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
