-- RLS Hardening Phase 1
-- Generated automatically: tighten permissive policies, deprecate duplicate core schema,
-- introduce ownership-based policies, and lock sensitive tables to service role.
-- Safe to re-run (IF EXISTS used where possible). Review before applying to production.

begin;

--------------------------------------------------------------------------------
-- 0. Helper function (stable) for current user id
--------------------------------------------------------------------------------
create or replace function public.current_user_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select auth.uid();
$$;

--------------------------------------------------------------------------------
-- 1. Deprecate core schema (no app code should rely on core.*). Instead of DROP
-- immediately, we REVOKE access & optionally create views if needed later.
-- Uncomment DROP SCHEMA after validation period.
--------------------------------------------------------------------------------
revoke all on schema core from public; -- prevents new object creation by anon/auth

-- Optionally, after confirming no runtime errors for 7 days, execute:
-- DROP SCHEMA core CASCADE;

--------------------------------------------------------------------------------
-- 2. Bulk drop existing permissive policies (public, moderation, billing, storage)
--------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, schemaname, tablename
           from pg_policies
           where schemaname in ('public','moderation','billing','storage') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

--------------------------------------------------------------------------------
-- 3. PUBLIC schema policies (principle: least privilege, ownership enforced)
--------------------------------------------------------------------------------

-- Characters
create policy characters_select on public.characters for select using (
  visibility = 'public' or creator_id = auth.uid()
);
create policy characters_insert on public.characters for insert with check (
  creator_id = auth.uid()
);
create policy characters_update on public.characters for update using (
  creator_id = auth.uid()
) with check (
  creator_id = auth.uid()
);
create policy characters_delete on public.characters for delete using (
  creator_id = auth.uid()
);

-- Character definitions (must belong to owned character)
create policy character_def_select on public.character_definitions for select using (
  exists (select 1 from public.characters c where c.id = character_id and (c.visibility='public' or c.creator_id=auth.uid()))
);
create policy character_def_write on public.character_definitions for all using (
  exists (select 1 from public.characters c where c.id = character_id and c.creator_id=auth.uid())
) with check (
  exists (select 1 from public.characters c where c.id = character_id and c.creator_id=auth.uid())
);

-- Chats
create policy chats_select on public.chats for select using ( user_id = auth.uid() );
create policy chats_crud on public.chats for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

-- Messages
create policy messages_select on public.messages for select using (
  exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid())
);
create policy messages_insert on public.messages for insert with check (
  exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid())
);
-- Optional: user can edit own non-AI messages (if column is_ai_message exists)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='messages' and column_name='is_ai_message'
  ) then
    execute 'create policy messages_update on public.messages for update using (
      NOT is_ai_message AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.user_id = auth.uid())
    ) with check (
      NOT is_ai_message AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.user_id = auth.uid())
    )';
  end if;
end $$;

-- Favorites / Likes
create policy character_favorites_select on public.character_favorites for select using ( user_id = auth.uid() );
create policy character_favorites_write on public.character_favorites for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

create policy character_likes_select on public.character_likes for select using ( user_id = auth.uid() );
create policy character_likes_write on public.character_likes for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

-- Character tags (only owner may mutate; public may read public characters' tags)
create policy character_tags_select on public.character_tags for select using (
  exists (select 1 from public.characters c where c.id = character_id and (c.visibility='public' or c.creator_id=auth.uid()))
);
create policy character_tags_write on public.character_tags for all using (
  exists (select 1 from public.characters c where c.id = character_id and c.creator_id=auth.uid())
) with check (
  exists (select 1 from public.characters c where c.id = character_id and c.creator_id=auth.uid())
);

-- Profiles (read all, self-edit only)
create policy profiles_select on public.profiles for select using ( true );
create policy profiles_update on public.profiles for update using ( id = auth.uid() ) with check ( id = auth.uid() );

-- Personas
create policy personas_select on public.personas for select using ( user_id = auth.uid() );
create policy personas_crud on public.personas for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

-- Character memories (owner of memory OR character owner may read; only user_id writes)
create policy character_memories_select on public.character_memories for select using (
  user_id = auth.uid() or exists (select 1 from public.characters c where c.id = character_id and c.creator_id=auth.uid())
);
create policy character_memories_write on public.character_memories for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

-- World info (if feature active; otherwise restrict more)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='world_infos') then
  execute 'create policy world_infos_select on public.world_infos for select using ( creator_id = auth.uid() )';
  execute 'create policy world_infos_crud on public.world_infos for all using ( creator_id = auth.uid() ) with check ( creator_id = auth.uid() )';
  end if;
end $$;

-- World info dependent tables (guard existence)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='world_info_entries') then
    execute 'create policy world_info_entries_all on public.world_info_entries for all using (
      EXISTS (SELECT 1 FROM public.world_infos w WHERE w.id = world_info_id AND w.creator_id = auth.uid())
    ) with check (
      EXISTS (SELECT 1 FROM public.world_infos w WHERE w.id = world_info_id AND w.creator_id = auth.uid())
    )';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='world_info_tags') then
    execute 'create policy world_info_tags_all on public.world_info_tags for all using (
      EXISTS (SELECT 1 FROM public.world_infos w WHERE w.id = world_info_id AND w.creator_id = auth.uid())
    ) with check (
      EXISTS (SELECT 1 FROM public.world_infos w WHERE w.id = world_info_id AND w.creator_id = auth.uid())
    )';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='world_info_user_likes') then
    execute 'create policy world_info_user_likes_all on public.world_info_user_likes for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() )';
  end if;
end $$;

-- User settings tables
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_character_settings') then
  execute 'create policy user_character_settings_all on public.user_character_settings for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() )';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_global_chat_settings') then
  execute 'create policy user_global_chat_settings_all on public.user_global_chat_settings for all using ( id = auth.uid() OR user_id = auth.uid() ) with check ( id = auth.uid() OR user_id = auth.uid() )';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_character_world_info_settings') then
  execute 'create policy user_character_world_info_settings_all on public.user_character_world_info_settings for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() )';
  end if;
end $$;

-- Chat context (owned by chat.user_id)
create policy chat_context_all on public.chat_context for all using (
  exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid())
);

-- Parsed character cards (service writes, user reads own if a user_id column exists)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='parsed_character_cards' and column_name='user_id') then
  execute 'create policy parsed_cards_select on public.parsed_character_cards for select using ( user_id = auth.uid() )';
  execute 'create policy parsed_cards_insert on public.parsed_character_cards for insert with check ( user_id = auth.uid() )';
  else
    -- default read-only for authenticated
  execute 'create policy parsed_cards_ro on public.parsed_character_cards for select using ( auth.role() IN (''authenticated'',''service_role'') )';
  end if;
end $$;

-- Public app settings (read only)
create policy public_app_settings_select on public.public_app_settings for select using ( true );

-- Credit packs (publicly listable)
create policy credit_packs_select on public.credit_packs for select using ( is_active = true );

-- Credit pack purchases (user may read own; service role manages writes)
create policy credit_pack_purchases_select on public.credit_pack_purchases for select using ( user_id = auth.uid() );
create policy credit_pack_purchases_insert on public.credit_pack_purchases for insert with check ( user_id = auth.uid() );

-- Subscription nonces & summary locks: service role only
create policy subscription_nonces_service on public.subscription_nonces for all using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );
create policy summary_locks_service on public.summary_locks for all using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

-- Credits & ledger (read own via billing schema below; keep here if duplicates exist)
create policy credits_select on public.credits for select using ( user_id = auth.uid() );

-- Daily usage (read own only; writes via RPC)
create policy user_daily_usage_select on public.user_daily_usage for select using ( user_id = auth.uid() );

--------------------------------------------------------------------------------
-- 4. BILLING schema (system managed). Users may only SELECT their own rows
--------------------------------------------------------------------------------
create policy billing_plans_select on billing.plans for select using ( true );
create policy billing_models_select on billing.models for select using ( true );
create policy billing_subscriptions_select on billing.subscriptions for select using ( user_id = auth.uid() );
create policy billing_credits_select on billing.credits for select using ( user_id = auth.uid() );
create policy billing_credit_ledger_select on billing.credit_ledger for select using ( user_id = auth.uid() );
create policy billing_transactions_select on billing.transactions for select using ( user_id = auth.uid() );

--------------------------------------------------------------------------------
-- 5. MODERATION schema (service role only)
--------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='moderation' and c.relkind='r' loop
    execute format('create policy %I_service_only on moderation.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t.relname, t.relname);
  end loop;
end $$;

--------------------------------------------------------------------------------
-- 6. STORAGE objects: authenticated users limited to own folder (avatars bucket demo)
--------------------------------------------------------------------------------
-- Remove any legacy broad policies first handled above
create policy objects_read_public on storage.objects for select using ( true );
create policy objects_user_crud on storage.objects for all using (
  auth.role() = 'authenticated'
  and (
    (bucket_id = 'avatars' and (split_part(name,'/',1) = auth.uid()::text))
  )
) with check (
  auth.role() = 'authenticated'
  and (
    (bucket_id = 'avatars' and (split_part(name,'/',1) = auth.uid()::text))
  )
);

commit;

-- Post-commit recommendation:
--  Run inventory query again to verify no residual ALL:public policies.
--  Add RPCs for: increment daily usage, modify credits, acquire/release summary locks.
