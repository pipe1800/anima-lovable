import { supabase } from '@/db/client';

// Lightweight local interfaces to avoid deep generic instantiation / codegen gaps
interface ChatContextRow { id?: string; chat_id: string; user_id?: string; character_id?: string; created_at?: string; current_context?: Record<string, any> | null; }
interface MessageRow { id: string; chat_id?: string; content: string | null; current_context: any; created_at: string; is_ai_message: boolean; message_order?: number; }
interface AddonSettingsRow { addon_settings?: any; }

export async function debugContextFlow(chatId: string, userId: string, characterId: string) {
  console.log('🔍 DEBUG: Starting context flow investigation for:', { chatId, userId, characterId });
  try {
    // 1. chat_context rows (limit 5)
    const { data: chatContext, error: chatContextError } = await supabase
      .from('chat_context')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(5) as unknown as { data: ChatContextRow[]; error: any };

    const hasAnyContext = (chatContext || []).some(ctx => {
      const cc = ctx.current_context;
      return cc && Object.values(cc).some(v => v && v !== 'No context');
    });

    console.log('📊 chat_context table:', {
      data: chatContext,
      error: chatContextError,
      count: chatContext?.length || 0,
      hasAnyContext
    });

    // 2. Recent messages (limit 10). Replace deprecated / wrong column `is_user` with `is_ai_message`.
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, content, current_context, created_at, is_ai_message')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(10) as unknown as { data: MessageRow[]; error: any };

    const recentMessages = (messages || []).slice(0, 3).map(m => ({
      id: m.id,
      isUser: !m.is_ai_message,
      hasContext: !!m.current_context,
      content: (m.content || '').substring(0, 50) + '...',
      context: m.current_context
    }));

    console.log('📨 Messages in chat:', {
      count: messages?.length || 0,
      messagesWithContext: (messages || []).filter(m => m.current_context),
      error: messagesError,
      recentMessages
    });

    // 3. User addon settings (table may not be in generated types yet) - cast supabase to any
    const { data: addonSettings, error: addonError } = await (supabase as any)
      .from('user_character_addons')
      .select('*')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .maybeSingle() as { data: AddonSettingsRow | null; error: any };

    console.log('⚙️ Addon settings:', {
      data: addonSettings,
      error: addonError,
      enabledAddons: addonSettings?.addon_settings,
      hasSettings: !!addonSettings
    });

    // 4. Chat existence
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id, user_id, character_id, created_at')
      .eq('id', chatId)
      .maybeSingle();

    console.log('💬 Chat info:', { data: chat, error: chatError, exists: !!chat });

    return { chatContext, messages, addonSettings, chat };
  } catch (error) {
    console.error('🔍 DEBUG: Error in context flow investigation:', error);
    throw error;
  }
}

export async function repairContextForChat(chatId: string, userId: string, characterId: string) {
  console.log('🔧 Starting context repair for chat:', chatId);
  try {
    const { data: existingContexts, error: fetchError } = await supabase
      .from('chat_context')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('character_id', characterId) as unknown as { data: ChatContextRow[]; error: any };

    console.log('🔧 Existing contexts:', { existingContexts, fetchError, count: existingContexts?.length || 0 });

    if (existingContexts && existingContexts.length > 0) {
      console.log('🔧 Deleting existing broken contexts');
      const { error: deleteError } = await supabase
        .from('chat_context')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .eq('character_id', characterId);
      if (deleteError) console.error('🔧 Error deleting contexts:', deleteError);
    }

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
    if (createError) throw createError;
    return newContext as ChatContextRow;
  } catch (error) {
    console.error('🔧 Context repair error:', error);
    throw error;
  }
}

export async function testEdgeFunction(chatId: string, testMessage: string) {
  console.log('🧪 Testing edge function with message:', testMessage);
  try {
    const { data, error } = await supabase.functions.invoke('chat-management', {
      body: { action: 'send_message', chatId, message: testMessage, test: true }
    });
    console.log('🧪 Edge function response:', { data, error });
    return { data, error };
  } catch (error) {
    console.error('🧪 Edge function test error:', error);
    throw error;
  }
}
