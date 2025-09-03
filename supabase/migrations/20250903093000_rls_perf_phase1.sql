-- RLS Performance Phase 1
-- High-traffic tables: public.messages, public.chats, public.characters,
-- billing.credit_ledger, billing.credits, billing.subscriptions, billing.credit_pack_purchases
-- Changes:
--  1. Wrap auth.uid() calls with (select auth.uid()) to avoid per-row re-evaluation (Supabase lint 0003).
--  2. Split broad FOR ALL policy "chats_crud" into explicit insert/update/delete policies.
--  3. Preserve existing logical access semantics.

-- ===============
-- public.messages
-- ===============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_delete') THEN
    EXECUTE 'DROP POLICY "messages_delete" ON public.messages';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_insert') THEN
    EXECUTE 'DROP POLICY "messages_insert" ON public.messages';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select') THEN
    EXECUTE 'DROP POLICY "messages_select" ON public.messages';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_update') THEN
    EXECUTE 'DROP POLICY "messages_update" ON public.messages';
  END IF;
END;$$;

CREATE POLICY "messages_delete" ON public.messages FOR DELETE USING (
  (author_id = (select auth.uid())) OR EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = messages.chat_id AND c.user_id = (select auth.uid())
  )
);

CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = messages.chat_id AND c.user_id = (select auth.uid())
  )
);

CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = messages.chat_id AND c.user_id = (select auth.uid())
  )
);

CREATE POLICY "messages_update" ON public.messages FOR UPDATE USING (
  (NOT is_ai_message) AND EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = messages.chat_id AND c.user_id = (select auth.uid())
  )
) WITH CHECK (
  (NOT is_ai_message) AND EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = messages.chat_id AND c.user_id = (select auth.uid())
  )
);

-- ===============
-- public.chats (split chats_crud)
-- ===============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chats' AND policyname='chats_crud') THEN
    EXECUTE 'DROP POLICY "chats_crud" ON public.chats';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chats' AND policyname='chats_select') THEN
    EXECUTE 'DROP POLICY "chats_select" ON public.chats';
  END IF;
END;$$;

CREATE POLICY "chats_select" ON public.chats FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "chats_insert" ON public.chats FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "chats_update" ON public.chats FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "chats_delete" ON public.chats FOR DELETE USING (user_id = (select auth.uid()));

-- ===============
-- public.characters
-- ===============
DO $$
BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='characters' AND policyname='characters_delete';
  IF FOUND THEN EXECUTE 'DROP POLICY "characters_delete" ON public.characters'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='characters' AND policyname='characters_insert';
  IF FOUND THEN EXECUTE 'DROP POLICY "characters_insert" ON public.characters'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='characters' AND policyname='characters_select';
  IF FOUND THEN EXECUTE 'DROP POLICY "characters_select" ON public.characters'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='characters' AND policyname='characters_update';
  IF FOUND THEN EXECUTE 'DROP POLICY "characters_update" ON public.characters'; END IF;
END;$$;

CREATE POLICY "characters_delete" ON public.characters FOR DELETE USING (creator_id = (select auth.uid()));
CREATE POLICY "characters_insert" ON public.characters FOR INSERT WITH CHECK (creator_id = (select auth.uid()));
CREATE POLICY "characters_select" ON public.characters FOR SELECT USING ((visibility = 'public') OR (creator_id = (select auth.uid())));
CREATE POLICY "characters_update" ON public.characters FOR UPDATE USING (creator_id = (select auth.uid())) WITH CHECK (creator_id = (select auth.uid()));

-- ===============
-- billing.credit_ledger
-- ===============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='credit_ledger' AND policyname='credit_ledger_select') THEN
    EXECUTE 'DROP POLICY "credit_ledger_select" ON billing.credit_ledger';
  END IF;
END;$$;

CREATE POLICY "credit_ledger_select" ON billing.credit_ledger FOR SELECT USING (user_id = (select auth.uid()));

-- ===============
-- billing.credits
-- ===============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='credits' AND policyname='Users can view own credits') THEN
    EXECUTE 'DROP POLICY "Users can view own credits" ON billing.credits';
  END IF;
END;$$;

CREATE POLICY "Users can view own credits" ON billing.credits FOR SELECT USING ((select auth.uid()) = user_id);

-- ===============
-- billing.subscriptions
-- ===============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='subscriptions' AND policyname='Users can view own subscriptions') THEN
    EXECUTE 'DROP POLICY "Users can view own subscriptions" ON billing.subscriptions';
  END IF;
END;$$;

CREATE POLICY "Users can view own subscriptions" ON billing.subscriptions FOR SELECT USING ((select auth.uid()) = user_id);

-- ===============
-- billing.credit_pack_purchases
-- ===============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='credit_pack_purchases' AND policyname='Users can view own purchases') THEN
    EXECUTE 'DROP POLICY "Users can view own purchases" ON billing.credit_pack_purchases';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='billing' AND tablename='credit_pack_purchases' AND policyname='billing_credit_pack_purchases_insert') THEN
    EXECUTE 'DROP POLICY "billing_credit_pack_purchases_insert" ON billing.credit_pack_purchases';
  END IF;
END;$$;

CREATE POLICY "Users can view own purchases" ON billing.credit_pack_purchases FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "billing_credit_pack_purchases_insert" ON billing.credit_pack_purchases FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- End Phase 1
