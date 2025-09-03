-- RLS Performance Phase 2
-- Remaining tables: definitional & medium-traffic user-linked tables.
-- Strategy: wrap auth.uid()/auth.role(), split broad FOR ALL policies.

-- Helper DO block pattern reused per table for idempotency.

-- public.character_definitions
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_definitions' AND policyname='character_def_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_def_select" ON public.character_definitions'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_definitions' AND policyname='character_def_write';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_def_write" ON public.character_definitions'; END IF;
END $$;
CREATE POLICY "character_def_select" ON public.character_definitions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_definitions.character_id
       AND (c.visibility = 'public' OR c.creator_id = (select auth.uid()))
  )
);
CREATE POLICY "character_def_insert" ON public.character_definitions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_definitions.character_id
       AND c.creator_id = (select auth.uid())
  )
);
CREATE POLICY "character_def_update" ON public.character_definitions FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_definitions.character_id
       AND c.creator_id = (select auth.uid())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_definitions.character_id
       AND c.creator_id = (select auth.uid())
  )
);
CREATE POLICY "character_def_delete" ON public.character_definitions FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_definitions.character_id
       AND c.creator_id = (select auth.uid())
  )
);

-- public.character_favorites
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_favorites' AND policyname='character_favorites_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_favorites_select" ON public.character_favorites'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_favorites' AND policyname='character_favorites_write';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_favorites_write" ON public.character_favorites'; END IF;
END $$;
CREATE POLICY "character_favorites_select" ON public.character_favorites FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "character_favorites_insert" ON public.character_favorites FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "character_favorites_delete" ON public.character_favorites FOR DELETE USING (user_id = (select auth.uid()));

-- public.character_likes
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_likes' AND policyname='character_likes_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_likes_select" ON public.character_likes'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_likes' AND policyname='character_likes_write';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_likes_write" ON public.character_likes'; END IF;
END $$;
CREATE POLICY "character_likes_select" ON public.character_likes FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "character_likes_insert" ON public.character_likes FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "character_likes_delete" ON public.character_likes FOR DELETE USING (user_id = (select auth.uid()));

-- public.character_memories
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_memories' AND policyname='character_memories_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_memories_select" ON public.character_memories'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_memories' AND policyname='character_memories_write';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_memories_write" ON public.character_memories'; END IF;
END $$;
CREATE POLICY "character_memories_select" ON public.character_memories FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "character_memories_insert" ON public.character_memories FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "character_memories_update" ON public.character_memories FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "character_memories_delete" ON public.character_memories FOR DELETE USING (user_id = (select auth.uid()));

-- public.character_tags
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_tags' AND policyname='character_tags_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_tags_select" ON public.character_tags'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_tags' AND policyname='character_tags_write';
  IF FOUND THEN EXECUTE 'DROP POLICY "character_tags_write" ON public.character_tags'; END IF;
END $$;
CREATE POLICY "character_tags_select" ON public.character_tags FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_tags.character_id
       AND (c.visibility = 'public' OR c.creator_id = (select auth.uid()))
  )
);
CREATE POLICY "character_tags_insert" ON public.character_tags FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_tags.character_id
       AND c.creator_id = (select auth.uid())
  )
);
CREATE POLICY "character_tags_delete" ON public.character_tags FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_tags.character_id
       AND c.creator_id = (select auth.uid())
  )
);

-- public.character_world_info_link
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_world_info_link' AND policyname='cwil_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "cwil_select" ON public.character_world_info_link'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='character_world_info_link' AND policyname='cwil_modify';
  IF FOUND THEN EXECUTE 'DROP POLICY "cwil_modify" ON public.character_world_info_link'; END IF;
END $$;
CREATE POLICY "cwil_select" ON public.character_world_info_link FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_world_info_link.character_id
       AND c.creator_id = (select auth.uid())
  )
);
CREATE POLICY "cwil_insert" ON public.character_world_info_link FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_world_info_link.character_id
       AND c.creator_id = (select auth.uid())
  )
);
CREATE POLICY "cwil_delete" ON public.character_world_info_link FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.characters c
     WHERE c.id = character_world_info_link.character_id
       AND c.creator_id = (select auth.uid())
  )
);

-- public.personas
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='personas' AND policyname='personas_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "personas_select" ON public.personas'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='personas' AND policyname='personas_crud';
  IF FOUND THEN EXECUTE 'DROP POLICY "personas_crud" ON public.personas'; END IF;
END $$;
CREATE POLICY "personas_select" ON public.personas FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "personas_insert" ON public.personas FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "personas_update" ON public.personas FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "personas_delete" ON public.personas FOR DELETE USING (user_id = (select auth.uid()));

-- public.profiles (no change in logic; wrap auth.uid)
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_owner_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "profiles_owner_select" ON public.profiles'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_update';
  IF FOUND THEN EXECUTE 'DROP POLICY "profiles_update" ON public.profiles'; END IF;
END $$;
CREATE POLICY "profiles_owner_select" ON public.profiles FOR SELECT USING (id = (select auth.uid()));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));

-- public.user_age_verification
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_age_verification' AND policyname='uav_self';
  IF FOUND THEN EXECUTE 'DROP POLICY "uav_self" ON public.user_age_verification'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_age_verification' AND policyname='uav_self_write';
  IF FOUND THEN EXECUTE 'DROP POLICY "uav_self_write" ON public.user_age_verification'; END IF;
END $$;
CREATE POLICY "uav_self_select" ON public.user_age_verification FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "uav_self_insert" ON public.user_age_verification FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "uav_self_update" ON public.user_age_verification FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- public.user_global_chat_settings
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_global_chat_settings' AND policyname='user_global_chat_settings_owner';
  IF FOUND THEN EXECUTE 'DROP POLICY "user_global_chat_settings_owner" ON public.user_global_chat_settings'; END IF;
END $$;
CREATE POLICY "user_global_chat_settings_select" ON public.user_global_chat_settings FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "user_global_chat_settings_update" ON public.user_global_chat_settings FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- public.chat_context
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_context' AND policyname='chat_context_all';
  IF FOUND THEN EXECUTE 'DROP POLICY "chat_context_all" ON public.chat_context'; END IF;
END $$;
CREATE POLICY "chat_context_select" ON public.chat_context FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = chat_context.chat_id AND c.user_id = (select auth.uid())
  )
);
CREATE POLICY "chat_context_update" ON public.chat_context FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = chat_context.chat_id AND c.user_id = (select auth.uid())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = chat_context.chat_id AND c.user_id = (select auth.uid())
  )
);

-- End Phase 2
