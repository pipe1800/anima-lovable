-- Migration: update get_user_chats to include message_count
-- Reason: need message_count in dashboard query; must DROP first because return row type changed.
-- Safe to re-run: guarded by create after drop.

begin;

-- Drop old function signature (no message_count)
DROP FUNCTION IF EXISTS public.get_user_chats(integer, integer);

-- Recreate with message_count column
CREATE FUNCTION public.get_user_chats(
  p_limit int default 20,
  p_offset int default 0
) RETURNS TABLE (
  chat_id uuid,
  character_id uuid,
  chat_created_at timestamptz,
  chat_updated_at timestamptz,
  character_name text,
  character_avatar_url text,
  last_message_id uuid,
  last_message_created_at timestamptz,
  last_message_is_ai boolean,
  last_message_content text,
  message_count bigint,
  total_count bigint
) LANGUAGE sql SECURITY INVOKER AS $$
  select
    c.id as chat_id,
    c.character_id,
    c.created_at as chat_created_at,
    c.updated_at as chat_updated_at,
    ch.name as character_name,
    ch.avatar_url as character_avatar_url,
    lm.id as last_message_id,
    lm.created_at as last_message_created_at,
    lm.is_ai_message as last_message_is_ai,
    lm.content as last_message_content,
    mc.message_count,
    count(*) over() as total_count
  from public.chats c
  left join public.characters ch on ch.id = c.character_id
  left join lateral (
    select m.id, m.created_at, m.is_ai_message, m.content
    from public.messages m
    where m.chat_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::bigint as message_count
    from public.messages m2
    where m2.chat_id = c.id
  ) mc on true
  where c.user_id = auth.uid()
  order by c.updated_at desc
  limit greatest(p_limit,0) offset greatest(p_offset,0);
$$;

-- Reapply grants (adjust as needed)
GRANT EXECUTE ON FUNCTION public.get_user_chats(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_chats(integer, integer) TO service_role;

commit;
