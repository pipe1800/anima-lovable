import { supabase } from '@/integrations/supabase/client';
import { convertDatabaseContextToTrackedContext } from './contextConverter';

/**
 * Test utility to verify context loading functionality
 */
export async function testContextLoading(chatId: string, userId: string, characterId: string) {
  console.log('🧪 Testing context loading for:', { chatId, userId, characterId });
  
  try {
    // Test 1: Direct table query
    console.log('📋 Test 1: Direct table query');
    const { data: directData, error: directError } = await supabase
      .from('chat_context')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .single();
    
    if (directError) {
      console.log('❌ Direct query error:', directError);
    } else {
    }
    
    // Test 2: RPC function query
    console.log('📋 Test 2: RPC function query');
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_chat_context', {
        p_chat_id: chatId,
        p_user_id: userId,
        p_character_id: characterId
      });
    
    if (rpcError) {
      console.log('❌ RPC query error:', rpcError);
    } else {
      
      // Test 3: Context conversion
      if (rpcData && rpcData.length > 0 && rpcData[0]?.current_context) {
        console.log('📋 Test 3: Context conversion');
        const converted = convertDatabaseContextToTrackedContext(rpcData[0].current_context);
      }
    }
    
    // Test 4: Check all context records for this chat
    console.log('📋 Test 4: All context records for chat');
    const { data: allContexts, error: allError } = await supabase
      .from('chat_context')
      .select('*')
      .eq('chat_id', chatId);
    
    if (allError) {
      console.log('❌ All contexts query error:', allError);
    } else {
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Add to window for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).testContextLoading = testContextLoading;
}
