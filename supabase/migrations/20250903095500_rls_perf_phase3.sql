-- RLS Performance Phase 3
-- Service-role oriented & latent/relationship domain tables.
-- Add (select auth.uid()) / (select auth.role()) pattern
-- Split service + user policies explicitly.

-- public.character_latent_profiles
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_latent_profiles' AND policyname='authenticated_users_read_latent_profiles';
  IF FOUND THEN EXECUTE 'DROP POLICY "authenticated_users_read_latent_profiles" ON public.character_latent_profiles'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_latent_profiles' AND policyname='service role manage latent profiles';
  IF FOUND THEN EXECUTE 'DROP POLICY "service role manage latent profiles" ON public.character_latent_profiles'; END IF;
END $$;
CREATE POLICY "character_latent_profiles_select" ON public.character_latent_profiles FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "character_latent_profiles_service_rw" ON public.character_latent_profiles USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- public.character_latent_profile_history
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_latent_profile_history' AND policyname='service role insert history';
  IF FOUND THEN EXECUTE 'DROP POLICY "service role insert history" ON public.character_latent_profile_history'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_latent_profile_history' AND policyname='service role select history';
  IF FOUND THEN EXECUTE 'DROP POLICY "service role select history" ON public.character_latent_profile_history'; END IF;
END $$;
CREATE POLICY "character_latent_profile_history_service_select" ON public.character_latent_profile_history FOR SELECT USING ((select auth.role()) = 'service_role');
CREATE POLICY "character_latent_profile_history_service_insert" ON public.character_latent_profile_history FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

-- public.user_character_relationship_progress
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_character_relationship_progress' AND policyname='service role manage relationship progress';
  IF FOUND THEN EXECUTE 'DROP POLICY "service role manage relationship progress" ON public.user_character_relationship_progress'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_character_relationship_progress' AND policyname='user manage own relationship progress';
  IF FOUND THEN EXECUTE 'DROP POLICY "user manage own relationship progress" ON public.user_character_relationship_progress'; END IF;
END $$;
CREATE POLICY "ucrp_user_select" ON public.user_character_relationship_progress FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "ucrp_user_upsert" ON public.user_character_relationship_progress FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "ucrp_user_update" ON public.user_character_relationship_progress FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "ucrp_service_rw" ON public.user_character_relationship_progress USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
CREATE POLICY "ucrp_user_delete" ON public.user_character_relationship_progress FOR DELETE USING ((select auth.uid()) = user_id);

-- public.user_character_relationship_signals
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_character_relationship_signals' AND policyname='service role manage relationship signals';
  IF FOUND THEN EXECUTE 'DROP POLICY "service role manage relationship signals" ON public.user_character_relationship_signals'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_character_relationship_signals' AND policyname='user manage own relationship signals';
  IF FOUND THEN EXECUTE 'DROP POLICY "user manage own relationship signals" ON public.user_character_relationship_signals'; END IF;
END $$;
CREATE POLICY "ucrs_user_select" ON public.user_character_relationship_signals FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "ucrs_user_insert" ON public.user_character_relationship_signals FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "ucrs_user_update" ON public.user_character_relationship_signals FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "ucrs_user_delete" ON public.user_character_relationship_signals FOR DELETE USING ((select auth.uid()) = user_id);
CREATE POLICY "ucrs_service_rw" ON public.user_character_relationship_signals USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- public.world_infos
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='world_infos' AND policyname='world_infos_public_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "world_infos_public_select" ON public.world_infos'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='world_infos' AND policyname='world_infos_crud';
  IF FOUND THEN EXECUTE 'DROP POLICY "world_infos_crud" ON public.world_infos'; END IF;
END $$;
CREATE POLICY "world_infos_select" ON public.world_infos FOR SELECT USING ((visibility = 'public') OR (creator_id = (select auth.uid())));
CREATE POLICY "world_infos_insert" ON public.world_infos FOR INSERT WITH CHECK (creator_id = (select auth.uid()));
CREATE POLICY "world_infos_update" ON public.world_infos FOR UPDATE USING (creator_id = (select auth.uid())) WITH CHECK (creator_id = (select auth.uid()));
CREATE POLICY "world_infos_delete" ON public.world_infos FOR DELETE USING (creator_id = (select auth.uid()));

-- End Phase 3
