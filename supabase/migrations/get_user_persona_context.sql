-- Function: public.get_user_persona_context
-- Purpose: Return consolidated persona context for the authenticated user (and optional chat)
-- Security: Enforces that the requested p_user_id matches auth.uid(). Row-Level Security still applies.
-- Inputs:
--   p_user_id        (uuid)   Target user (must equal auth.uid())
--   p_chat_id        (uuid)   Optional chat whose selected persona we want (must belong to user)
--   p_include_list   (bool)   Whether to include the full personas list
-- Output JSON shape:
-- {
--   "default_persona_id": uuid | null,
--   "last_used_persona_id": uuid | null,
--   "first_persona_id": uuid | null,
--   "chat_selected_persona": { id, name, bio, lore, avatar_url } | null,
--   "personas": [ { id, name, bio, lore, avatar_url, created_at, updated_at } ] | null (null if not requested)
-- }
-- Index considerations (already present / recommended):
--   chats(user_id, updated_at desc)
--   personas(user_id, created_at asc)
--   chats(selected_persona_id)

create or replace function public.get_user_persona_context(
  p_user_id uuid default auth.uid(),
  p_chat_id uuid default null,
  p_include_list boolean default false
) returns json language plpgsql stable security invoker as $$
declare
  v_default_persona uuid;
  v_last_used_persona uuid;
  v_first_persona uuid;
  v_chat_persona_row record;
  v_chat_persona jsonb := null;
  v_personas jsonb := null; -- remain null unless requested
begin
  -- Explicit ownership check (defense-in-depth beyond RLS)
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: cannot access persona context for another user';
  end if;

  -- Default persona from profile
  select default_persona_id into v_default_persona
  from public.profiles
  where id = p_user_id;

  -- Last used persona: most recently updated chat with a non-null selected_persona_id
  select c.selected_persona_id into v_last_used_persona
  from public.chats c
  where c.user_id = p_user_id
    and c.selected_persona_id is not null
  order by c.updated_at desc
  limit 1;

  -- First persona created (chronological)
  select p.id into v_first_persona
  from public.personas p
  where p.user_id = p_user_id
  order by p.created_at asc
  limit 1;

  -- Chat selected persona (if chat provided & belongs to user)
  if p_chat_id is not null then
    select pr.id, pr.name, pr.bio, pr.lore, pr.avatar_url
    into v_chat_persona_row
    from public.chats c
    left join public.personas pr on pr.id = c.selected_persona_id
    where c.id = p_chat_id
      and c.user_id = p_user_id
    limit 1;

    if found and v_chat_persona_row.id is not null then
      v_chat_persona := to_jsonb(v_chat_persona_row);
    end if;
  end if;

  -- Personas list (optional, ordered newest first for UI convenience)
  if p_include_list then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'bio', p.bio,
      'lore', p.lore,
      'avatar_url', p.avatar_url,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) order by p.created_at desc), '[]'::jsonb)
    into v_personas
    from public.personas p
    where p.user_id = p_user_id;
  end if;

  return json_build_object(
    'default_persona_id', v_default_persona,
    'last_used_persona_id', v_last_used_persona,
    'first_persona_id', v_first_persona,
    'chat_selected_persona', v_chat_persona,
    'personas', v_personas
  );
end;$$;

comment on function public.get_user_persona_context(uuid, uuid, boolean) is 'Consolidated persona context for the authenticated user: default, last used, first, optional chat selection, optional full list.';

revoke all on function public.get_user_persona_context(uuid, uuid, boolean) from public;
grant execute on function public.get_user_persona_context(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_user_persona_context(uuid, uuid, boolean) to service_role;
