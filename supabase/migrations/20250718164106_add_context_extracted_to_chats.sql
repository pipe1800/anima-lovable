-- Add context_extracted column to chats table
-- This flag indicates whether background context extraction has been completed for a chat

ALTER TABLE chats 
ADD COLUMN context_extracted BOOLEAN DEFAULT FALSE;

-- Add index for performance when querying chats that need context extraction
CREATE INDEX idx_chats_context_extracted ON chats(context_extracted) WHERE context_extracted = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN chats.context_extracted IS 'Flag indicating whether background context extraction has been completed for this chat';
