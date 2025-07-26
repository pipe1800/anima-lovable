-- Create function to delete user account and all associated data
CREATE OR REPLACE FUNCTION delete_user_account(user_id uuid)
RETURNS void AS $$
BEGIN
  -- Delete user data in correct order to respect foreign key constraints
  -- Delete character-related data first
  DELETE FROM public.character_tags WHERE character_id IN (SELECT id FROM public.characters WHERE creator_id = user_id);
  DELETE FROM public.character_definitions WHERE character_id IN (SELECT id FROM public.characters WHERE creator_id = user_id);
  DELETE FROM public.characters WHERE creator_id = user_id;
  
  -- Delete chat-related data
  DELETE FROM public.chat_messages WHERE user_id = user_id;
  DELETE FROM public.chats WHERE user_id = user_id;
  
  -- Delete persona data
  DELETE FROM public.personas WHERE user_id = user_id;
  
  -- Delete world info data
  DELETE FROM public.world_info_entries WHERE world_info_id IN (SELECT id FROM public.world_infos WHERE creator_id = user_id);
  DELETE FROM public.world_infos WHERE creator_id = user_id;
  
  -- Delete billing and subscription data
  DELETE FROM public.credits WHERE user_id = user_id;
  DELETE FROM public.subscriptions WHERE user_id = user_id;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE id = user_id;
  
  -- Delete the auth user (this will cascade to other auth-related tables)
  DELETE FROM auth.users WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (they can only delete their own account due to RLS)
GRANT EXECUTE ON FUNCTION delete_user_account(uuid) TO authenticated;
