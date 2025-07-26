import { supabase } from '@/integrations/supabase/client';

export async function debugContextFlow(chatId: string, userId: string, characterId: string) {
  console.log('🔍 DEBUG: Starting context flow investigation for:', { chatId, userId, characterId });
  
  try {
    // 1. Check chat_context table
    const { data: chatContext, error: chatContextError } = await supabase
      .from('chat_context')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(5);
      
    console.log('📊 chat_context table:', { 
      data: chatContext, 
      error: chatContextError,
      count: chatContext?.length || 0,
      hasAnyContext: chatContext?.some(ctx => ctx.current_context && Object.values(ctx.current_context).some(v => v !== 'No context'))
    });
    
    // 2. Check messages with context
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, content, current_context, created_at, is_user')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(10);
      
    console.log('📨 Messages in chat:', {
      count: messages?.length || 0,
      messagesWithContext: messages?.filter(m => m.current_context),
      error: messagesError,
      recentMessages: messages?.slice(0, 3).map(m => ({
        id: m.id,
        isUser: m.is_user,
        hasContext: !!m.current_context,
        content: m.content?.substring(0, 50) + '...',
        context: m.current_context
      }))
    });
    
    // 3. Check user addon settings
    const { data: addonSettings, error: addonError } = await supabase
      .from('user_character_addons')
      .select('*')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .single();
      
    console.log('⚙️ Addon settings:', {
      data: addonSettings,
      error: addonError,
      enabledAddons: addonSettings?.addon_settings,
      hasSettings: !!addonSettings
    });
    
    // 4. Check if chat exists
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id, user_id, character_id, created_at')
      .eq('id', chatId)
      .single();
      
    console.log('💬 Chat info:', {
      data: chat,
      error: chatError,
      exists: !!chat
    });
    
    return {
      chatContext,
      messages,
      addonSettings,
      chat
    };
  } catch (error) {
    console.error('🔍 DEBUG: Error in context flow investigation:', error);
    throw error;
  }
}

export async function repairContextForChat(chatId: string, userId: string, characterId: string) {
  console.log('🔧 Starting context repair for chat:', chatId);
  
  try {
    // 1. Check if chat_context record exists
    const { data: existingContexts, error: fetchError } = await supabase
      .from('chat_context')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('character_id', characterId);
      
    console.log('🔧 Existing contexts:', { existingContexts, fetchError, count: existingContexts?.length || 0 });
    
    // 2. Delete any existing broken contexts
    if (existingContexts && existingContexts.length > 0) {
      console.log('🔧 Deleting existing broken contexts');
      const { error: deleteError } = await supabase
        .from('chat_context')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .eq('character_id', characterId);
        
      if (deleteError) {
        console.error('🔧 Error deleting contexts:', deleteError);
      }
    }
    
    // 3. Create a new context record with CORRECT DATABASE FORMAT
    console.log('🔧 Creating new context record with correct format');
    
    const { data: newContext, error: createError } = await supabase
      .from('chat_context')
      .insert({
        user_id: userId,
        character_id: characterId,
        chat_id: chatId,
        current_context: {
          mood: 'happy and excited',
          clothing: 'maid uniform',
          location: 'bedroom',
          time_weather: 'evening',
          relationship: 'servant and master',
          character_position: 'standing'
        }
      })
      .select()
      .single();
      
    console.log('🔧 Created context:', { newContext, createError });
    
    if (createError) {
      throw createError;
    }
    
    return newContext;
    
  } catch (error) {
    console.error('🔧 Context repair error:', error);
    throw error;
  }
}

export async function testEdgeFunction(chatId: string, testMessage: string) {
  console.log('🧪 Testing edge function with message:', testMessage);
  
  try {
    const { data, error } = await supabase.functions.invoke('chat-management', {
      body: {
        action: 'send_message',
        chatId: chatId,
        message: testMessage,
        test: true // Add test flag
      }
    });
    
    console.log('🧪 Edge function response:', { data, error });
    return { data, error };
  } catch (error) {
    console.error('🧪 Edge function test error:', error);
    throw error;
  }
}
