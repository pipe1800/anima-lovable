-- Function: public.get_user_chats(p_limit int, p_offset int)
-- Purpose: Return paginated chat catalog for the authenticated user with latest message, message count, and character summary.
-- Security: SECURITY INVOKER (default) so RLS still applies. Explicit user_id filter for defense in depth.
-- Note: total_count repeated per row; derive unique total client-side.

create or replace function public.get_user_chats(
  p_limit int default 20,
  p_offset int default 0
) returns table (
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
) language sql as $$
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

-- Suggested indexes (apply manually if not present):
-- create index if not exists idx_chats_user_updated_at on public.chats(user_id, updated_at desc);
-- create index if not exists idx_messages_chat_created_at on public.messages(chat_id, created_at desc);
