-- get_user_snapshot_v2 RPC: unified snapshot contract version 2
-- Includes profile, subscription(+plan), credits, settings, personas (light), characters (light),
-- recent chats, favorites, tags, stats counts. Returns JSON matching docs/snapshot-contract-v2.md
-- SECURITY: Ensure only authenticated user fetches own snapshot.

create or replace function public.get_user_snapshot_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, billing
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_subscription jsonb;
  v_plan jsonb;
  v_credits jsonb;
  v_settings jsonb;
  v_personas jsonb;
  v_characters jsonb;
  v_recent_chats jsonb;
  v_favorite_ids jsonb;
  v_tags jsonb;
  v_stats jsonb;
  v_now timestamptz := now();
  v_included text[] := ARRAY['profile','subscription','credits','personas','characters','recent_chats','favorites','tags','settings','stats'];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Profile (private)
  select to_jsonb(p) - 'email' into v_profile
  from profiles p
  where p.id = v_uid;

  -- Subscription + plan (direct from billing.*) with explicit JSON construction (avoid enum serialization issues)
  begin
    select jsonb_build_object(
             'id', s.id,
             'user_id', s.user_id,
             'plan_id', s.plan_id,
             'status', (s.status)::text,
             'current_period_end', s.current_period_end,
             'stripe_subscription_id', s.stripe_subscription_id,
             'created_at', s.created_at,
             'paypal_subscription_id', s.paypal_subscription_id
           )
    into v_subscription
    from billing.subscriptions s
    where s.user_id = v_uid
    order by case when (s.status)::text in ('active','trialing') then 0 else 1 end,
             s.current_period_end desc nulls last,
             s.created_at desc
    limit 1;
  exception when others then
    v_subscription := null; -- swallow any enum/text issues
  end;

  if v_subscription is not null then
    select to_jsonb(pl) into v_plan
    from billing.plans pl
    where pl.id = (v_subscription->>'plan_id')::uuid;
    if v_plan is not null then
      v_subscription := (v_subscription || jsonb_build_object('plan', v_plan));
    end if;
  end if;

  -- Credits (direct from billing.*)
  select jsonb_build_object('balance', coalesce(c.balance,0)) into v_credits
  from billing.credits c where c.user_id = v_uid;
  if v_credits is null then v_credits := jsonb_build_object('balance',0); end if;

  -- Global chat settings (light weight)
  select to_jsonb(s) into v_settings
  from user_global_chat_settings s where s.user_id = v_uid;

  -- Personas (lightweight subset)
  select coalesce(jsonb_agg(to_jsonb(pn) - 'bio' - 'lore'), '[]'::jsonb) into v_personas
  from (
    select id, name, avatar_url, updated_at
    from personas
    where user_id = v_uid
    order by updated_at desc
    limit 100
  ) pn;

  -- Characters (owned lightweight list)
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_characters
  from (
    select id, name, short_description, avatar_url, visibility, interaction_count,
           chats_count, likes_count, updated_at
    from character_profile_view
    where creator_id = v_uid
    order by updated_at desc
    limit 100
  ) c;

  -- Recent chats (limit 25) using existing helper view/function if available
  -- Fallback: direct query
  begin
    select coalesce(jsonb_agg(to_jsonb(rc)), '[]'::jsonb) into v_recent_chats
    from (
      select ch.id, ch.title, ch.last_message_at, ch.character_id,
             cpv.name as character_name, cpv.avatar_url as character_avatar_url,
             ch.last_message, ch.last_message_is_ai, ch.message_count
      from chats ch
      left join character_profile_view cpv on cpv.id = ch.character_id
      where ch.user_id = v_uid
      order by ch.last_message_at desc nulls last
      limit 25
    ) rc;
  exception when others then
    v_recent_chats := '[]'::jsonb;
  end;

  -- Favorites ids
  select coalesce(jsonb_agg(to_jsonb(x) -> 'id'), '[]'::jsonb) into v_favorite_ids
  from (
    select cf.character_id as id
    from character_favorites cf
    join characters c on c.id = cf.character_id and c.visibility = 'public'
    where cf.user_id = v_uid
    order by cf.created_at desc
    limit 500
  ) x;

  -- Tags (simple list of tag names if table exists)
  begin
    select coalesce(jsonb_agg(to_jsonb(t.name)), '[]'::jsonb) into v_tags
    from tags t
    join user_tags ut on ut.tag_id = t.id and ut.user_id = v_uid;
  exception when others then
    -- Any error (missing table, permission, RLS) -> empty list instead of aborting
    v_tags := '[]'::jsonb;
  end;

  -- Stats
  select jsonb_build_object(
    'total_chats', (select count(*) from chats ch where ch.user_id = v_uid),
    'total_characters', jsonb_array_length(coalesce(v_characters,'[]'::jsonb)),
    'total_personas', jsonb_array_length(coalesce(v_personas,'[]'::jsonb)),
    'total_favorites', jsonb_array_length(coalesce(v_favorite_ids,'[]'::jsonb))
  ) into v_stats;

  return jsonb_build_object(
    'version', 2,
    'generated_at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'user_id', v_uid,
    'included_sections', v_included,
    'profile', v_profile,
    'subscription', v_subscription,
    'credits', v_credits,
    'user_global_chat_settings', v_settings,
    'personas', coalesce(v_personas, '[]'::jsonb),
    'characters', coalesce(v_characters, '[]'::jsonb),
    'recent_chats', coalesce(v_recent_chats, '[]'::jsonb),
    'favorite_character_ids', coalesce(v_favorite_ids, '[]'::jsonb),
    'tags', coalesce(v_tags, '[]'::jsonb),
    'stats', coalesce(v_stats, jsonb_build_object('total_chats',0,'total_characters',0,'total_personas',0,'total_favorites',0))
  );
end;
$$;

comment on function public.get_user_snapshot_v2() is 'Returns unified user snapshot (version 2).';

grant execute on function public.get_user_snapshot_v2() to authenticated;
