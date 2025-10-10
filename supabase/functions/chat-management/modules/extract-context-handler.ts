import { extractInitialContext } from './context-extractor.ts';
import { getUserPlanAndModel } from './billing.ts';
export async function handleExtractContext(request, user, supabase, supabaseAdmin) {
  try {
    const { chatId, charactersData, worldInfos } = request;
    console.log('Extracting context for chat:', chatId);
    // Verify chat exists and belongs to user
    const { data: chat, error: chatError } = await supabase.from('chats').select('id, user_id').eq('id', chatId).eq('user_id', user.id).single();
    if (chatError || !chat) {
      throw new Error('Chat not found or access denied');
    }
    // Determine plan-specific token budget
    const { maxContextTokens } = await getUserPlanAndModel(user.id, supabaseAdmin);
    // Extract context with budget
    const contextData = await extractInitialContext(charactersData, worldInfos || [], chatId, maxContextTokens // model/plan-derived max
    );
    console.log('✅ Context extracted successfully');
    return {
      success: true,
      chat_id: chatId,
      context: contextData.context,
      data: {
        message: 'Context extracted successfully',
        characterCount: contextData.characterCount,
        worldInfoCount: contextData.worldInfoCount,
        totalTokens: contextData.totalTokens
      }
    };
  } catch (error) {
    console.error('Error in handleExtractContext:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
