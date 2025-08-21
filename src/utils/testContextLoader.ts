import { supabase } from '@/integrations/supabase/client';
import { convertDatabaseContextToTrackedContext } from './contextConverter';

/**
 * Test utility to verify context loading functionality
 * Consolidated to a single RPC call (get_chat_context) to avoid duplicate logic.
 * NOTE: The RPC signature includes p_user_id but the underlying SQL function ignores it
 * and uses auth.uid() instead (see public.get_chat_context definition). It is still
 * supplied here only to satisfy the argument list.
 */
export async function testContextLoading(chatId: string, userId: string, characterId: string) {
  console.log('🧪 Testing context loading for:', { chatId, userId, characterId });
  try {
    // Single source of truth: RPC function
    console.log('📋 Fetching context via RPC (public.get_chat_context)');
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_chat_context', {
      p_chat_id: chatId,
      p_user_id: userId, // Ignored by backend (auth.uid() used internally)
      p_character_id: characterId
    });

    if (rpcError) {
      console.log('❌ RPC query error:', rpcError);
    } else if (rpcData && rpcData.length > 0 && rpcData[0]?.current_context) {
      console.log('✅ RPC returned context, converting...');
      const converted = convertDatabaseContextToTrackedContext(rpcData[0].current_context);
      console.log('🧩 Converted context keys:', Object.keys(converted || {}));
    } else {
      console.log('ℹ️ No context rows returned by RPC');
    }

    // Supplementary: inspect all raw context rows for the chat (direct table query, debugging only)
    console.log('📋 Inspecting all context records for chat (direct table query)');
    const { data: allContexts, error: allError } = await supabase
      .from('chat_context')
      .select('*')
      .eq('chat_id', chatId);
    if (allError) {
      console.log('❌ All contexts query error:', allError);
    } else {
      console.log(`🧾 Found ${allContexts?.length || 0} raw context rows for chat`);
    }
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Add to window for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).testContextLoading = testContextLoading;
}
