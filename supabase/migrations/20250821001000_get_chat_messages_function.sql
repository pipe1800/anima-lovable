begin;

create or replace function public.get_chat_messages(
  p_chat_id uuid,
  p_limit int default 30,
  p_before_order bigint default null
) returns table (
  id uuid,
  chat_id uuid,
  author_id uuid,
  is_ai_message boolean,
  content text,
  created_at timestamptz,
  message_order bigint,
  current_context jsonb,
  context_updates jsonb,
  has_more boolean
) language sql as $$
  with base as (
    select m.id,
           m.chat_id,
           m.author_id,
           m.is_ai_message,
           m.content,
           m.created_at,
           m.message_order,
           m.current_context,
           mc.context_updates,
           row_number() over (order by m.message_order desc) as rn
    from public.messages m
    join public.chats c on c.id = m.chat_id and c.user_id = auth.uid()
    left join lateral (
      select jsonb_agg(jsonb_build_object('context_updates', x.context_updates) order by x.created_at desc) -> 0 as context_updates
      from public.chat_context x
      where x.chat_id = m.chat_id and x.message_id = m.id
    ) mc on true
    where m.chat_id = p_chat_id
      and (p_before_order is null or m.message_order < p_before_order)
    order by m.message_order desc
    limit least(greatest(p_limit,1), 100)
  )
  select b.id, b.chat_id, b.author_id, b.is_ai_message, b.content, b.created_at, b.message_order, b.current_context, b.context_updates,
         exists (
           select 1 from public.messages m2
           join public.chats c2 on c2.id = m2.chat_id and c2.user_id = auth.uid()
           where m2.chat_id = p_chat_id
             and m2.message_order < (select min(message_order) from base)
         ) as has_more
  from base b
  order by b.message_order desc;
$$;

commit;
