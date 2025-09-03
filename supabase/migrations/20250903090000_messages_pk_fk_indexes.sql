-- Purpose: Hardening messages & chats performance + integrity
-- Adds: primary key, foreign key, composite indexes, last_message_at trigger
-- Idempotent: guarded checks so re-running is safe

BEGIN;

-- 1. Ensure primary key on messages.id (was previously only a UUID default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.messages'::regclass
       AND contype = 'p'
  ) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
  END IF;
END$$;

-- 2. Add FK to chats (cascade delete so orphaned messages are cleaned automatically)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.messages'::regclass
       AND contype = 'f'
       AND conname = 'messages_chat_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_chat_id_fkey
        FOREIGN KEY (chat_id) REFERENCES public.chats(id)
        ON DELETE CASCADE;
  END IF;
END$$;

-- 3. Performance indexes
-- Keyset pagination / recent fetches per chat (created_at DESC scan + id tiebreaker)
CREATE INDEX IF NOT EXISTS idx_messages_chat_created_desc
  ON public.messages (chat_id, created_at DESC, id);

-- Existing idx_messages_chat_order already supports ORDER BY message_order DESC via backward scan.
-- Add a covering index for user chat list queries (if not already present)
CREATE INDEX IF NOT EXISTS idx_chats_user_updated_desc
  ON public.chats (user_id, updated_at DESC, id);

-- 4. Trigger to maintain chats.last_message_at (only moves forward)
CREATE OR REPLACE FUNCTION public.set_chat_last_message_time()
RETURNS trigger AS $$
BEGIN
  -- Update only if newer (or NULL)
  UPDATE public.chats
     SET last_message_at = NEW.created_at,
         updated_at = NOW()
   WHERE id = NEW.chat_id
     AND (last_message_at IS NULL OR NEW.created_at > last_message_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_chat_last_message_time ON public.messages;
CREATE TRIGGER trg_set_chat_last_message_time
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_chat_last_message_time();

COMMIT;

-- Verification hints (optional to run manually):
-- \d public.messages
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename='messages';
-- SELECT conname, contype FROM pg_constraint WHERE conrelid='public.messages'::regclass;
