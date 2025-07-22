-- Test script to verify context is being saved correctly
-- Run this in Supabase SQL editor to check context data

-- 1. Check if chat_context table has any data
SELECT 
    cc.chat_id,
    cc.user_id,
    cc.character_id,
    cc.current_context,
    cc.created_at,
    cc.updated_at
FROM chat_context cc
ORDER BY cc.updated_at DESC
LIMIT 10;

-- 2. Check if messages have current_context data
SELECT 
    m.id,
    m.chat_id,
    m.is_ai_message,
    m.content,
    m.current_context,
    m.created_at
FROM messages m
WHERE m.current_context IS NOT NULL
ORDER BY m.created_at DESC
LIMIT 10;

-- 3. Check specific chat context (replace with actual chat_id)
-- SELECT * FROM get_chat_context('your-chat-id-here', 'your-user-id-here', 'your-character-id-here');

-- 4. Check global settings for a user (replace with actual user_id)
-- SELECT * FROM user_global_chat_settings WHERE user_id = 'your-user-id-here';
