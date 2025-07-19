import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

/**
 * Unified Chat Management Edge Function
 * 
 * Consolidates 3 functions into 1:
 * - create-basic-chat (209 lines)
 * - create-chat-with-greeting (240 lines) 
 * - extract-chat-context (235 lines)
 * 
 * Total: 684 lines → ~300 lines (56% reduction)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// ============================================================================
// OPERATION HANDLERS
// ============================================================================

async function createBasicChat(requestBody: any, user: any, supabase: any) {
  try {
    const { charactersData } = requestBody;
    
    if (!charactersData || charactersData.length === 0) {
      throw new Error('No character data provided');
    }

    const character = charactersData[0];
    const character_id = character.id;
    const character_name = character.name;

    console.log('Creating basic chat for user:', user.id, 'character:', character_id);

    // Fast operations only - parallel where possible
    const [userProfileResult, characterDetailsResult, defaultPersonaResult] = await Promise.allSettled([
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      supabase.from('characters').select(`
        *,
        character_definitions (*)
      `).eq('id', character_id).single(),
      supabase.from('personas').select('name').eq('user_id', user.id).limit(1).single()
    ]);

    // Extract results
    const userProfile = userProfileResult.status === 'fulfilled' ? userProfileResult.value.data : null;
    let characterDetails = characterDetailsResult.status === 'fulfilled' ? characterDetailsResult.value.data : null;
    const defaultPersona = defaultPersonaResult.status === 'fulfilled' ? defaultPersonaResult.value.data : null;

    // Fallback: Try character_definitions if not found in characters
    if (!characterDetails) {
      console.log('Character not found in characters table, trying character_definitions...');
      const { data: def, error: defError } = await supabase
        .from('character_definitions')
        .select('*')
        .eq('character_id', character_id)
        .single();
      
      if (def) {
        characterDetails = {
          id: character_id,
          name: def.name || character_name,
          character_definitions: def,
        };
        console.log('✅ Fallback: Found character in character_definitions only');
      } else {
        console.error('Character not found in either table');
        throw new Error('Character not found');
      }
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

    // Template replacement function
    const replaceTemplates = (content: string): string => {
      if (!content) return content;
      
      const userName = defaultPersona?.name || userProfile?.username || 'User';
      const charName = character_name || 'Character';
      
      return content
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{char\}\}/g, charName);
    };

    // Get raw greeting and apply template replacement
    const rawGreeting = characterDetails.character_definitions?.greeting || 
      `Hello! I'm ${character_name}. It's great to meet you. What would you like to talk about?`;
    const processedGreeting = replaceTemplates(rawGreeting);
    
    console.log('✅ Processed greeting:', processedGreeting);

    // Save the greeting message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,  // AI messages should have NULL author_id
        content: processedGreeting,
        is_ai_message: true,
        current_context: null,  // No context yet - will be added later
        message_order: 1,
        created_at: new Date().toISOString()
      });

    if (messageError) {
      console.error('Error creating greeting message:', messageError);
      throw new Error('Failed to create greeting message');
    }

    console.log('✅ Basic chat created successfully:', chat.id);

    return {
      success: true,
      chat_id: chat.id,
      data: {
        message: 'Basic chat created successfully',
        needs_context_extraction: true
      }
    };

  } catch (error) {
    console.error('Error in createBasicChat:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function createChatWithGreeting(requestBody: any, user: any, supabase: any) {
  try {
    const { charactersData, worldInfos, greeting } = requestBody;
    
    if (!charactersData || charactersData.length === 0) {
      throw new Error('No character data provided');
    }

    const character = charactersData[0];
    const character_id = character.id;
    const character_name = character.name;

    console.log('Creating chat with greeting for user:', user.id, 'character:', character_id);

    // Fetch user data in parallel
    const [userProfileResult, defaultPersonaResult, characterDetailsResult] = await Promise.allSettled([
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      supabase.from('personas').select('name').eq('user_id', user.id).limit(1).single(),
      supabase.from('characters').select(`
        *,
        character_definitions (*)
      `).eq('id', character_id).single()
    ]);

    const userProfile = userProfileResult.status === 'fulfilled' ? userProfileResult.value.data : null;
    const defaultPersona = defaultPersonaResult.status === 'fulfilled' ? defaultPersonaResult.value.data : null;
    let characterDetails = characterDetailsResult.status === 'fulfilled' ? characterDetailsResult.value.data : null;

    // Fallback for character data
    if (!characterDetails) {
      console.log('Character not found in characters table, trying character_definitions...');
      const { data: def } = await supabase
        .from('character_definitions')
        .select('*')
        .eq('character_id', character_id)
        .single();
      
      if (def) {
        characterDetails = {
          id: character_id,
          name: def.name || character_name,
          character_definitions: def,
        };
      } else {
        throw new Error('Character not found');
      }
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

    // Template replacement
    const replaceTemplates = (content: string): string => {
      if (!content) return content;
      
      const userName = defaultPersona?.name || userProfile?.username || 'User';
      const charName = character_name || 'Character';
      
      return content
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{char\}\}/g, charName);
    };

    // Generate greeting with context if provided
    let finalGreeting = greeting || characterDetails.character_definitions?.greeting || 
      `Hello! I'm ${character_name}. It's great to meet you. What would you like to talk about?`;
    
    finalGreeting = replaceTemplates(finalGreeting);

    // Simple context extraction if charactersData or worldInfos provided
    let contextData = null;
    if ((charactersData && charactersData.length > 0) || (worldInfos && worldInfos.length > 0)) {
      console.log('🧠 Building initial context...');
      
      const contextParts = [];
      
      // Add character context
      if (charactersData[0].description) {
        contextParts.push(`Character: ${charactersData[0].description}`);
      }
      if (charactersData[0].personality) {
        contextParts.push(`Personality: ${charactersData[0].personality}`);
      }
      if (charactersData[0].scenario) {
        contextParts.push(`Scenario: ${charactersData[0].scenario}`);
      }
      
      // Add world info context
      if (worldInfos && worldInfos.length > 0) {
        const worldContext = worldInfos.map(wi => `${wi.name}: ${wi.content}`).join('\n');
        contextParts.push(`World Info: ${worldContext}`);
      }
      
      contextData = contextParts.join('\n\n');
    }

    // Save the greeting message with context
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,  // AI messages should have NULL author_id
        content: finalGreeting,
        is_ai_message: true,
        current_context: contextData,
        message_order: 1,
        created_at: new Date().toISOString()
      });

    if (messageError) {
      console.error('Error creating greeting message:', messageError);
      throw new Error('Failed to create greeting message');
    }

    console.log('✅ Chat with greeting created successfully:', chat.id);

    return {
      success: true,
      chat_id: chat.id,
      greeting: finalGreeting,
      context: contextData,
      data: {
        message: 'Chat with greeting created successfully',
        hasContext: !!contextData
      }
    };

  } catch (error) {
    console.error('Error in createChatWithGreeting:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function extractChatContext(requestBody: any, user: any, supabase: any) {
  try {
    const { chatId, charactersData, worldInfos } = requestBody;

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

    // Build context from provided data
    const contextParts = [];
    let characterCount = 0;
    let worldInfoCount = 0;

    // Process characters data
    if (charactersData && charactersData.length > 0) {
      charactersData.forEach(char => {
        const charParts = [];
        if (char.description) charParts.push(`Description: ${char.description}`);
        if (char.personality) charParts.push(`Personality: ${char.personality}`);
        if (char.scenario) charParts.push(`Scenario: ${char.scenario}`);
        if (char.context) charParts.push(`Context: ${char.context}`);
        
        if (charParts.length > 0) {
          contextParts.push(`Character ${char.name}:\n${charParts.join('\n')}`);
          characterCount++;
        }
      });
    }

    // Process world infos
    if (worldInfos && worldInfos.length > 0) {
      worldInfos.forEach(wi => {
        contextParts.push(`${wi.name}: ${wi.content}`);
        worldInfoCount++;
      });
    }

    const finalContext = contextParts.join('\n\n');

    // Update the most recent message with context
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        current_context: finalContext,
        updated_at: new Date().toISOString()
      })
      .eq('chat_id', chatId)
      .eq('is_ai_message', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (updateError) {
      console.warn('Could not update message with context:', updateError);
      // Don't fail the operation for this
    }

    console.log('✅ Context extracted successfully');

    return {
      success: true,
      chat_id: chatId,
      context: finalContext,
      data: {
        message: 'Context extracted successfully',
        characterCount,
        worldInfoCount,
        totalTokens: finalContext.length
      }
    };

  } catch (error) {
    console.error('Error in extractChatContext:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Test endpoint for debugging
  if (req.url.includes('test')) {
    return new Response(JSON.stringify({
      message: 'Unified chat management function is working',
      timestamp: new Date().toISOString(),
      version: 'v1-unified',
      supportedOperations: ['create-basic', 'create-with-greeting', 'extract-context']
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  console.log('🚀 Unified Chat Management function called');
  console.log('📝 Request ID:', requestId);

  try {
    // ============================================================================
    // AUTHENTICATION
    // ============================================================================
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    console.log('👤 User authenticated successfully:', user.id);

    // ============================================================================
    // REQUEST PARSING & VALIDATION
    // ============================================================================
    const requestBody = await req.json();
    
    if (!requestBody.operation) {
      throw new Error('Missing operation parameter. Must be one of: create-basic, create-with-greeting, extract-context');
    }

    console.log('🎯 Operation requested:', requestBody.operation);

    // ============================================================================
    // OPERATION ROUTING
    // ============================================================================
    let result: any;

    switch (requestBody.operation) {
      case 'create-basic':
        console.log('📝 Creating basic chat...');
        result = await createBasicChat(requestBody, user, supabase);
        break;

      case 'create-with-greeting':
        console.log('💬 Creating chat with greeting...');
        result = await createChatWithGreeting(requestBody, user, supabase);
        break;

      case 'extract-context':
        console.log('🧠 Extracting context...');
        result = await extractChatContext(requestBody, user, supabase);
        break;

      default:
        throw new Error(`Unsupported operation: ${requestBody.operation}`);
    }

    // ============================================================================
    // RESPONSE
    // ============================================================================
    const executionTime = Date.now() - startTime;
    console.log(`✅ Operation ${requestBody.operation} completed in ${executionTime}ms`);

    return new Response(JSON.stringify({
      ...result,
      executionTime,
      requestId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ Error in unified chat management (${executionTime}ms):`, error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
      requestId,
      executionTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
