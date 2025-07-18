-- Debug query to check message orders in a specific chat
-- Replace 'your-chat-id' with an actual chat ID where you're seeing the issue

SELECT 
  id,
  content,
  is_ai_message,
  message_order,
  created_at,
  is_placeholder
FROM public.messages 
WHERE chat_id = 'your-chat-id'
ORDER BY message_order ASC;

-- Also check if there are any messages without message_order
SELECT 
  COUNT(*) as messages_without_order
FROM public.messages 
WHERE message_order IS NULL;
