import { convertDatabaseContextToTrackedContext } from './contextConverter';
import { getChatContextRPC as getChatContext, getChatContext as getChatContextRow } from '@/data/chats/queries';

/**
 * Test utility to verify context loading functionality
 * Updated to use consolidated chat queries (chat/context deprecated).
 */
export async function testContextLoading(chatId: string, userId: string, characterId: string) {
  console.log('🧪 Testing context loading for:', { chatId, userId, characterId });
  try {
    console.log('📋 Fetching context via consolidated data layer (getChatContextRPC)');
    const { data: rpcData, error: rpcError } = await getChatContext(chatId, userId, characterId);

    if (rpcError) {
      console.log('❌ RPC query error:', rpcError);
    } else if (rpcData && rpcData.length > 0 && (rpcData[0] as any)?.current_context) {
      console.log('✅ RPC returned context, converting...');
      const converted = convertDatabaseContextToTrackedContext((rpcData[0] as any).current_context);
      console.log('🧩 Converted context keys:', Object.keys(converted || {}));
    } else {
      console.log('ℹ️ No context rows returned by RPC');
    }

    console.log('📋 Inspecting single row via table accessor');
    const { data: rowData } = await getChatContextRow({ chatId, userId, characterId });
    console.log('🔍 Direct row current_context present?', !!rowData?.current_context);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

if (typeof window !== 'undefined') {
  (window as any).testContextLoading = testContextLoading;
}
