-- Canonical recreation of character_profile_view (merged, with was_public, security_invoker)
-- Safe to run multiple times (idempotent apart from grants)
-- NOTE: Includes explicit DROP to eliminate legacy definitions lacking was_public or security_invoker.

begin;

-- Remove any existing definition (cascade in case dependent objects exist; adjust if unwanted)
DROP VIEW IF EXISTS public.character_profile_view CASCADE;

CREATE VIEW public.character_profile_view AS
SELECT
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
  /* Removed model_id per request */
  jsonb_build_object(
    'greeting', cd.greeting,
    'description', cd.description,
    'personality_summary', cd.personality_summary,
    'scenario', cd.scenario
  ) AS character_definitions,
  jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'avatar_url', p.avatar_url
  ) AS creator,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
    FROM (
      SELECT DISTINCT t.id, t.name
      FROM public.character_tags ct
      JOIN public.tags t ON t.id = ct.tag_id
      WHERE ct.character_id = c.id
    ) s
  ), '[]'::jsonb) AS tags,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'short_description', s.short_description) ORDER BY s.name)
    FROM (
      SELECT DISTINCT w.id, w.name, w.short_description
      FROM public.character_world_info_link cwil
      JOIN public.world_infos w ON w.id = cwil.world_info_id
      WHERE cwil.character_id = c.id
    ) s
  ), '[]'::jsonb) AS world_infos
FROM public.characters c
LEFT JOIN public.character_definitions cd ON cd.character_id = c.id
LEFT JOIN public.profiles p ON p.id = c.creator_id;

-- Ensure invoker rights so underlying RLS applies per user
ALTER VIEW public.character_profile_view SET (security_invoker = true);

-- Tighten and then re-grant intended permissions
REVOKE ALL ON public.character_profile_view FROM PUBLIC;
GRANT SELECT ON public.character_profile_view TO anon, authenticated, service_role;

commit;
