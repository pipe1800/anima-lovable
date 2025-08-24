import { convertDatabaseContextToTrackedContext } from './contextConverter';
import { getChatContext, getChatContextEnhanced, getChatSnapshot } from '@/data/chats/queries';

/**
 * Test utility to verify context loading functionality
 * Uses consolidated chat queries (RPC removed).
 */
export async function testContextLoading(chatId: string, userId: string, characterId: string) {
  console.log('🧪 Testing context loading for:', { chatId, userId, characterId });
  try {
    console.log('📋 Fetching snapshot (includes context & messages)');
    const { data: snap, error: snapErr } = await getChatSnapshot(chatId, userId, characterId, { limit: 5 });
    if (snapErr) {
      console.log('❌ Snapshot error:', snapErr);
    } else {
      const converted = convertDatabaseContextToTrackedContext(snap?.current_context);
      console.log('✅ Snapshot context keys:', converted ? Object.keys(converted) : []);
      console.log('🗨️ Snapshot messages fetched:', snap?.messages?.length || 0);
    }

    console.log('📋 Fetching single row via enhanced accessor');
    const { trackedContext } = await getChatContextEnhanced(chatId, userId, characterId);
    console.log('🔍 Enhanced context keys:', trackedContext ? Object.keys(trackedContext) : []);

    console.log('📋 Direct row (raw) check');
    const { data: rowData } = await getChatContext({ chatId, userId, characterId });
    console.log('🔎 Raw current_context present?', !!rowData?.current_context);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

if (typeof window !== 'undefined') {
  (window as any).testContextLoading = testContextLoading; // eslint-disable-line @typescript-eslint/no-explicit-any
}
