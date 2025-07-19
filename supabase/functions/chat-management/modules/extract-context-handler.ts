import { extractInitialContext } from './context-extractor.ts';
import type { ExtractContextRequest, ChatResponse } from '../types/index.ts';

export async function handleExtractContext(
  request: ExtractContextRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<ChatResponse> {
  try {
    const { chatId, charactersData, worldInfos } = request;

    console.log('Extracting context for chat:', chatId);

    // Verify chat exists and belongs to user
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id, user_id')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (chatError || !chat) {
      throw new Error('Chat not found or access denied');
    }

    // Extract context
    const contextData = await extractInitialContext(
      charactersData,
      worldInfos || [],
      chatId,
      4000  // maxTokens
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
