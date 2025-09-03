-- Phase 4: RLS performance consolidation & duplicate index cleanup
-- Date: 2025-09-03
-- Purpose:
--  1. Replace per-row auth.uid() / auth.role() calls with (select auth.uid()) / (select auth.role()) for flagged policies (Supabase Advisor 0003)
--  2. Consolidate multiple permissive policies into single per-action policies to remove duplication (Advisor 0006)
--  3. Drop duplicate index on public.messages (Advisor 0009)
--
-- Safe to run multiple times (idempotent) via existence checks.

-----------------------------
-- 1. Fix auth.* call patterns
-----------------------------
DO $$ BEGIN
  -- world_info_entries_all
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='world_info_entries' AND policyname='world_info_entries_all'
  ) THEN
    EXECUTE 'DROP POLICY "world_info_entries_all" ON public.world_info_entries';
    EXECUTE 'CREATE POLICY "world_info_entries_all" ON public.world_info_entries FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.world_infos w
         WHERE w.id = world_info_id AND w.creator_id = (select auth.uid())
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.world_infos w
         WHERE w.id = world_info_id AND w.creator_id = (select auth.uid())
      ))';
  END IF;

  -- world_info_tags_all
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='world_info_tags' AND policyname='world_info_tags_all'
  ) THEN
    EXECUTE 'DROP POLICY "world_info_tags_all" ON public.world_info_tags';
    EXECUTE 'CREATE POLICY "world_info_tags_all" ON public.world_info_tags FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.world_infos w
         WHERE w.id = world_info_id AND w.creator_id = (select auth.uid())
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.world_infos w
         WHERE w.id = world_info_id AND w.creator_id = (select auth.uid())
      ))';
  END IF;

  -- world_info_user_likes_all
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='world_info_user_likes' AND policyname='world_info_user_likes_all'
  ) THEN
    EXECUTE 'DROP POLICY "world_info_user_likes_all" ON public.world_info_user_likes';
    EXECUTE 'CREATE POLICY "world_info_user_likes_all" ON public.world_info_user_likes FOR ALL
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()))';
  END IF;

  -- user_character_settings_all
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='user_character_settings' AND policyname='user_character_settings_all'
  ) THEN
    EXECUTE 'DROP POLICY "user_character_settings_all" ON public.user_character_settings';
    EXECUTE 'CREATE POLICY "user_character_settings_all" ON public.user_character_settings FOR ALL
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()))';
  END IF;

  -- user_character_world_info_settings_all
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='user_character_world_info_settings' AND policyname='user_character_world_info_settings_all'
  ) THEN
    EXECUTE 'DROP POLICY "user_character_world_info_settings_all" ON public.user_character_world_info_settings';
    EXECUTE 'CREATE POLICY "user_character_world_info_settings_all" ON public.user_character_world_info_settings FOR ALL
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()))';
  END IF;

  -- subscription_nonces_service
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='subscription_nonces' AND policyname='subscription_nonces_service'
  ) THEN
    EXECUTE 'DROP POLICY "subscription_nonces_service" ON public.subscription_nonces';
    EXECUTE 'CREATE POLICY "subscription_nonces_service" ON public.subscription_nonces FOR ALL
      USING ((select auth.role()) = ''service_role'')
      WITH CHECK ((select auth.role()) = ''service_role'')';
  END IF;

  -- billing.transactions select policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='billing' AND tablename='transactions' AND policyname='billing_transactions_select'
  ) THEN
    EXECUTE 'DROP POLICY "billing_transactions_select" ON billing.transactions';
    EXECUTE 'CREATE POLICY "billing_transactions_select" ON billing.transactions FOR SELECT
      USING (user_id = (select auth.uid()))';
  END IF;
END $$;

---------------------------------------------------------
-- 2. Consolidate multi-permissive relationship domain RLS
---------------------------------------------------------
-- character_latent_profiles
DO $$ BEGIN
  -- Drop old overlapping policies if present
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_latent_profiles' AND policyname='character_latent_profiles_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_latent_profiles_select" ON public.character_latent_profiles'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_latent_profiles' AND policyname='character_latent_profiles_service_rw';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_latent_profiles_service_rw" ON public.character_latent_profiles'; END IF;

  -- New non-overlapping policies
  EXECUTE 'CREATE POLICY "clp_select" ON public.character_latent_profiles FOR SELECT
     USING ((select auth.role()) IN (''authenticated'',''service_role''))';
  -- Write restricted to service_role only
  EXECUTE 'CREATE POLICY "clp_service_insert" ON public.character_latent_profiles FOR INSERT
     WITH CHECK ((select auth.role()) = ''service_role'')';
  EXECUTE 'CREATE POLICY "clp_service_update" ON public.character_latent_profiles FOR UPDATE
     USING ((select auth.role()) = ''service_role'') WITH CHECK ((select auth.role()) = ''service_role'')';
  EXECUTE 'CREATE POLICY "clp_service_delete" ON public.character_latent_profiles FOR DELETE
     USING ((select auth.role()) = ''service_role'')';
END $$;

-- user_character_relationship_progress
DO $$ DECLARE
  pol RECORD;
BEGIN
  -- Drop old policies
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename='user_character_relationship_progress'
       AND policyname LIKE 'ucrp_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_character_relationship_progress', pol.policyname);
  END LOOP;

  -- Consolidated per-action policies
  EXECUTE 'CREATE POLICY "ucrp_select_v2" ON public.user_character_relationship_progress FOR SELECT
    USING ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
  EXECUTE 'CREATE POLICY "ucrp_insert_v2" ON public.user_character_relationship_progress FOR INSERT
    WITH CHECK ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
  EXECUTE 'CREATE POLICY "ucrp_update_v2" ON public.user_character_relationship_progress FOR UPDATE
    USING ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )
    WITH CHECK ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
  EXECUTE 'CREATE POLICY "ucrp_delete_v2" ON public.user_character_relationship_progress FOR DELETE
    USING ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
END $$;

-- user_character_relationship_signals
DO $$ DECLARE
  pol RECORD;
BEGIN
  -- Drop old policies
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename='user_character_relationship_signals'
       AND policyname LIKE 'ucrs_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_character_relationship_signals', pol.policyname);
  END LOOP;

  -- Consolidated per-action policies
  EXECUTE 'CREATE POLICY "ucrs_select_v2" ON public.user_character_relationship_signals FOR SELECT
    USING ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
  EXECUTE 'CREATE POLICY "ucrs_insert_v2" ON public.user_character_relationship_signals FOR INSERT
    WITH CHECK ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
  EXECUTE 'CREATE POLICY "ucrs_update_v2" ON public.user_character_relationship_signals FOR UPDATE
    USING ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )
    WITH CHECK ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
  EXECUTE 'CREATE POLICY "ucrs_delete_v2" ON public.user_character_relationship_signals FOR DELETE
    USING ( (select auth.uid()) = user_id OR (select auth.role()) = ''service_role'' )';
END $$;

-----------------------------------------
-- 3. Remove duplicate messages index (0009)
-----------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='messages' AND indexname='idx_messages_chat_created_at'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='messages' AND indexname='idx_messages_chat_id_created_at'
  ) THEN
    -- Keep idx_messages_chat_id_created_at (older, stable); drop the other duplicate.
    EXECUTE 'DROP INDEX IF EXISTS public.idx_messages_chat_created_at';
  END IF;
END $$;

-- (Optional future step) If you decide idx_messages_chat_created_desc (chat_id, created_at DESC, id) fully supersedes the 2-column index,
-- run a later migration to drop idx_messages_chat_id_created_at after confirming query plans.

-- END Phase 4
