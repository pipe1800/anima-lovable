import { extractInitialContext, saveContextUpdates } from './context-extractor.ts';
import { 
  processGreetingWithContext, 
  createTemplateReplacer,
  generateGreeting 
} from './greeting-processor.ts';
import { fetchUserCharacterData } from './character-fetcher.ts';
import type { CreateWithGreetingRequest, ChatResponse } from '../types/index.ts';

export async function handleCreateWithGreeting(
  request: CreateWithGreetingRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<ChatResponse> {
  try {
    const { charactersData, worldInfos, greeting } = request;
    
    if (!charactersData || charactersData.length === 0) {
      throw new Error('No character data provided');
    }

    const character = charactersData[0];
    const character_id = character.id;
    const character_name = character.name;

    console.log('Creating chat with greeting for user:', user.id, 'character:', character_id);

    // Fetch user data in parallel
    const [userProfileResult, defaultPersonaResult] = await Promise.allSettled([
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      supabase.from('personas').select('name').eq('user_id', user.id).limit(1).single()
    ]);

    const userProfile = userProfileResult.status === 'fulfilled' ? userProfileResult.value.data : null;
    const defaultPersona = defaultPersonaResult.status === 'fulfilled' ? defaultPersonaResult.value.data : null;

    // Fetch character data
    const characterData = await fetchUserCharacterData(supabase, user.id, character_id);
    
    if (!characterData) {
      throw new Error('Character not found or access denied');
    }

    // Create the chat record
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        character_id: character_id,
        title: `Chat with ${character_name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (chatError) {
      console.error('Error creating chat:', chatError);
      throw new Error('Failed to create chat');
    }

    console.log('Chat created:', chat.id);

    // Create template replacer
    const templateReplacer = createTemplateReplacer(defaultPersona, userProfile, character_name);

    // Generate greeting
    const greetingText = greeting || generateGreeting(characterData, templateReplacer);
    
    // Extract initial context if we have character/world data
    let contextData = null;
    if (charactersData.length > 0 || (worldInfos && worldInfos.length > 0)) {
      console.log('🧠 Extracting initial context...');
      
      try {
        contextData = await extractInitialContext({
          characters: charactersData,
          worldInfos: worldInfos || [],
          chatId: chat.id,
          maxTokens: 4000,
          prioritizeRecent: false
        });
        
        console.log('✅ Context extracted successfully');
      } catch (contextError) {
        console.warn('⚠️ Context extraction failed, proceeding without context:', contextError.message);
      }
    }

    // Process greeting with context
    const processedGreeting = processGreetingWithContext(
      greetingText,
      contextData,
      templateReplacer
    );

    // Save the greeting message with context
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,  // AI messages should have NULL author_id
        content: processedGreeting.processedGreeting,
        is_ai_message: true,
        current_context: contextData?.context || null,
        message_order: 1,
        created_at: new Date().toISOString()
      });

    if (messageError) {
      console.error('Error creating greeting message:', messageError);
      throw new Error('Failed to create greeting message');
    }

    // Save context updates if available
    if (contextData) {
      await saveContextUpdates(supabaseAdmin, chat.id, contextData);
    }

    console.log('✅ Chat with greeting created successfully:', chat.id);

    return {
      success: true,
      chat_id: chat.id,
      greeting: processedGreeting.processedGreeting,
      context: contextData?.context,
      data: {
        message: 'Chat with greeting created successfully',
        contextInfo: contextData ? {
          characterCount: contextData.characterCount,
          worldInfoCount: contextData.worldInfoCount,
          totalTokens: contextData.totalTokens
        } : null
      }
    };

  } catch (error) {
    console.error('Error in handleCreateWithGreeting:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
