-- Create RPC to return user's chats with last message, message count, and character summary
-- Uses security definer to allow optimized aggregation without multiple client round trips
-- Rollback: drop function get_user_chats_batched(p_user_id uuid)

create or replace function public.get_user_chats_batched(p_user_id uuid)
returns table (
  chat_id uuid,
  title text,
  last_message_at timestamptz,
  created_at timestamptz,
  character_id uuid,
  last_message text,
  last_message_is_ai boolean,
  message_count integer,
  chat_mode text,
  time_awareness_enabled boolean,
  character_name text,
  character_avatar_url text,
  character_short_description text
) language sql stable security definer
set search_path = public as $$
  with base as (
    select c.id as chat_id,
           c.title,
           c.last_message_at,
           c.created_at,
           c.character_id
    from chats c
    where c.user_id = p_user_id
  ), last_messages as (
    select distinct on (m.chat_id) m.chat_id,
           m.content as last_message,
           m.is_ai_message as last_message_is_ai
    from messages m
    join base b on b.chat_id = m.chat_id
    where m.is_placeholder = false
    order by m.chat_id, m.created_at desc
  ), counts as (
    select m.chat_id, count(*)::int as message_count
    from messages m
    join base b on b.chat_id = m.chat_id
    where m.is_placeholder = false
    group by m.chat_id
  ), settings as (
    select ucs.character_id, ucs.chat_mode, coalesce(ucs.time_awareness_enabled,false) as time_awareness_enabled
    from user_character_settings ucs
    where ucs.user_id = p_user_id
  )
  select b.chat_id,
         b.title,
         b.last_message_at,
         b.created_at,
         b.character_id,
         lm.last_message,
         coalesce(lm.last_message_is_ai,false) as last_message_is_ai,
         coalesce(cts.message_count,0) as message_count,
         coalesce(st.chat_mode,'storytelling') as chat_mode,
         coalesce(st.time_awareness_enabled,false) as time_awareness_enabled,
         ch.name as character_name,
         ch.avatar_url as character_avatar_url,
         ch.short_description as character_short_description
  from base b
  left join last_messages lm on lm.chat_id = b.chat_id
  left join counts cts on cts.chat_id = b.chat_id
  left join settings st on st.character_id = b.character_id
  left join characters ch on ch.id = b.character_id
  order by b.last_message_at desc nulls last, b.created_at desc;
$$;

-- Ensure function is accessible via RLS respecting policies (SECURITY DEFINER requires explicit grants)
revoke all on function public.get_user_chats_batched(uuid) from public;
grant execute on function public.get_user_chats_batched(uuid) to authenticated, service_role, anon;
