-- Add message ordering and placeholder support to messages table
-- This fixes streaming message ordering issues

-- Add new columns to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS message_order INTEGER,
ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_messages_chat_order ON public.messages(chat_id, message_order);

-- Create index for non-placeholder messages
CREATE INDEX IF NOT EXISTS idx_messages_chat_real ON public.messages(chat_id, is_placeholder, created_at) WHERE is_placeholder = FALSE;

-- Create trigger for updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update existing messages with order based on created_at
WITH ordered_messages AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at) as order_num
  FROM public.messages
  WHERE message_order IS NULL
)
UPDATE public.messages m
SET message_order = om.order_num
FROM ordered_messages om
WHERE m.id = om.id;

-- Make message_order NOT NULL after setting values
ALTER TABLE public.messages ALTER COLUMN message_order SET NOT NULL;

-- Set default for message_order for new inserts
ALTER TABLE public.messages ALTER COLUMN message_order SET DEFAULT 1;
