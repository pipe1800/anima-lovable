import { supabase } from '@/db/client';
import { callEdgeFunction } from '@/data/edge/core/client';
import { ChatContextMaintenance, DebugDiagnostics } from '@/data';

// Lightweight local interfaces to avoid deep generic instantiation / codegen gaps
interface ChatContextRow { id?: string; chat_id: string; user_id?: string; character_id?: string; created_at?: string; current_context?: Record<string, any> | null; }
interface MessageRow { id: string; chat_id?: string; content: string | null; current_context: any; created_at: string; is_ai_message: boolean; message_order?: number; }
interface AddonSettingsRow { addon_settings?: any; }

export async function debugContextFlow(chatId: string, userId: string, characterId: string) {
  console.log('🔍 DEBUG: Starting context flow investigation for:', { chatId, userId, characterId });
  try {
    // 1. chat_context rows (limit 5)
  const { data: chatContext, error: chatContextError } = await ChatContextMaintenance.fetchRecentChatContext(chatId) as unknown as { data: ChatContextRow[]; error: any };

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
  const { data: messages, error: messagesError } = await DebugDiagnostics.fetchChatMessagesForDebug(chatId) as unknown as { data: MessageRow[]; error: any };

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
  const { data: addonSettings, error: addonError } = await DebugDiagnostics.fetchAddonSettings(userId, characterId) as { data: AddonSettingsRow | null; error: any };

    console.log('⚙️ Addon settings:', {
      data: addonSettings,
      error: addonError,
      enabledAddons: addonSettings?.addon_settings,
      hasSettings: !!addonSettings
    });

    // 4. Chat existence
  const { data: chat, error: chatError } = await DebugDiagnostics.fetchChatInfo(chatId);

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
  const { data: existingContexts, error: fetchError } = await DebugDiagnostics.fetchExistingChatContexts(chatId, userId, characterId) as unknown as { data: ChatContextRow[]; error: any };

    console.log('🔧 Existing contexts:', { existingContexts, fetchError, count: existingContexts?.length || 0 });

    if (existingContexts && existingContexts.length > 0) {
      console.log('🔧 Deleting existing broken contexts');
  const { error: deleteError } = await DebugDiagnostics.deleteChatContexts(chatId, userId, characterId);
      if (deleteError) console.error('🔧 Error deleting contexts:', deleteError);
    }

    console.log('🔧 Creating new context record with correct format');
    const { data: newContext, error: createError } = await ChatContextMaintenance.insertOrReplaceChatContext({
      chatId,
      userId,
      characterId,
      currentContext: {
        mood: 'happy and excited',
        clothing: 'maid uniform',
        location: 'bedroom',
        time_weather: 'evening',
        relationship: 'servant and master',
        character_position: 'standing'
      }
    }) as any;

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
    const result = await callEdgeFunction<any>('chat-management', { // eslint-disable-line @typescript-eslint/no-explicit-any
      action: 'send_message', chatId, message: testMessage, test: true
    });
    console.log('🧪 Edge function response:', result);
    return { data: result.data, error: result.error };
  } catch (error) {
    console.error('🧪 Edge function test error:', error);
    throw error;
  }
}
