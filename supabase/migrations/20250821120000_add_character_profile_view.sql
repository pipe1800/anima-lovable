-- Recreate character_profile_view for frontend compatibility
-- Provides denormalized character data with definitions, creator, tags, world infos, and counters

create or replace view public.character_profile_view as
select
  c.id,
  c.name,
  c.short_description,
  c.avatar_url,
  c.interaction_count,
  c.created_at,
  c.updated_at,
  c.creator_id,
  c.visibility,
  c.was_public,
  c.chats_count,
  c.messages_count,
  c.likes_count,
  c.favorites_count,
  jsonb_build_object(
    'personality_summary', cd.personality_summary,
    'description', cd.description,
    'greeting', cd.greeting,
    'scenario', cd.scenario,
    'model_id', cd.model_id
  ) as character_definitions,
  (
    select jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'avatar_url', p.avatar_url
    )
    from public.profiles p
    where p.id = c.creator_id
  ) as creator,
  (
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name))
            filter (where t.id is not null), '[]'::jsonb)
    from public.character_tags ct
    join public.tags t on t.id = ct.tag_id
    where ct.character_id = c.id
  ) as tags,
  (
    select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'short_description', w.short_description))
            filter (where w.id is not null), '[]'::jsonb)
    from public.character_world_info_link cwil
    join public.world_infos w on w.id = cwil.world_info_id
    where cwil.character_id = c.id
  ) as world_infos
from public.characters c
left join public.character_definitions cd on cd.character_id = c.id;

-- Ensure the view runs with invoker's rights so underlying RLS policies apply per user
alter view public.character_profile_view set (security_invoker = true);

-- Permissions (optional explicit grants; Supabase usually manages via RLS on underlying tables)
grant select on public.character_profile_view to anon, authenticated;
