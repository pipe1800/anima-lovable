-- Create function to get aggregated character stats
CREATE OR REPLACE FUNCTION get_character_stats(character_id UUID)
RETURNS TABLE (
    total_chats BIGINT,
    total_messages BIGINT,
    unique_users BIGINT,
    average_rating NUMERIC,
    total_favorites BIGINT,
    total_likes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT c.id)::BIGINT as total_chats,
        COUNT(m.id)::BIGINT as total_messages,
        COUNT(DISTINCT c.user_id)::BIGINT as unique_users,
        NULL::NUMERIC as average_rating, -- Placeholder for future rating system
        (SELECT COUNT(*)::BIGINT FROM character_favorites cf WHERE cf.character_id = $1) as total_favorites,
        (SELECT COUNT(*)::BIGINT FROM character_likes cl WHERE cl.character_id = $1) as total_likes
    FROM chats c
    LEFT JOIN messages m ON m.chat_id = c.id
    WHERE c.character_id = $1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
