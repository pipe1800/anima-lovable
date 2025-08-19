-- Add ai_sequence_number column to messages if not exists
DO $$ BEGIN
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ai_sequence_number integer;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'ai_sequence_number add skipped: %', SQLERRM;
END $$;

-- Backfill: assign sequence per chat ordered by created_at where is_ai_message=true
WITH ordered AS (
  SELECT id, chat_id,
         ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at ASC, message_order ASC, id) AS rn
    FROM public.messages
   WHERE is_ai_message = true
)
UPDATE public.messages m
   SET ai_sequence_number = o.rn
  FROM ordered o
 WHERE m.id = o.id AND (m.ai_sequence_number IS NULL OR m.ai_sequence_number = 0);

-- Trigger function to set ai_sequence_number on AI message inserts
CREATE OR REPLACE FUNCTION public.set_ai_sequence_number()
RETURNS trigger AS $$
BEGIN
  IF (NEW.is_ai_message = true) THEN
    SELECT COALESCE(MAX(ai_sequence_number),0) + 1 INTO NEW.ai_sequence_number
      FROM public.messages WHERE chat_id = NEW.chat_id AND is_ai_message = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_ai_sequence_number ON public.messages;
CREATE TRIGGER trg_set_ai_sequence_number
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_ai_sequence_number();
