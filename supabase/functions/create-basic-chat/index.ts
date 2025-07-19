import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🚀 Create basic chat function called - Fast Version');

  try {
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create user-scoped client for authentication and RLS
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
      console.error('Authentication failed:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestBody = await req.json();
    const { character_id, character_name, addonSettings } = requestBody;

    if (!character_id || !character_name) {
      throw new Error('Missing character_id or character_name');
    }

    console.log('Creating basic chat for user:', user.id, 'character:', character_id);
    console.log('Addon settings received:', JSON.stringify(addonSettings, null, 2));

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
        console.error('Character fetch error:', characterDetailsResult.status === 'rejected' ? characterDetailsResult.reason : 'Character not found');
        console.error('Character_definitions fetch error:', defError);
        throw new Error('Character not found');
      }
    }

    console.log('Character details fetched:', {
      hasDefinitions: !!characterDetails.character_definitions,
      greeting: characterDetails.character_definitions?.greeting?.substring(0, 50)
    });

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

    // Update chat with last_message_at timestamp
    await supabase.from('chats').update({
      last_message_at: new Date().toISOString()
    }).eq('id', chat.id);

    // Template replacement function (same logic as original)
    const replaceTemplates = (content: string): string => {
      if (!content) return content;
      
      const userName = defaultPersona?.name || userProfile?.username || 'User';
      const charName = character_name || 'Character';
      
      console.log('🔧 Template replacement - userName:', userName, 'charName:', charName);
      const replaced = content
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{char\}\}/g, charName);
      
      if (content !== replaced) {
        console.log('🔄 Template replaced in greeting:', content, '->', replaced);
      }
      
      return replaced;
    };

    // Get raw greeting from character definitions and apply template replacement
    const rawGreeting = characterDetails.character_definitions?.greeting || 
      `Hello! I'm ${character_name}. It's great to meet you. What would you like to talk about?`;
    const processedGreeting = replaceTemplates(rawGreeting);
    
    console.log('✅ Processed greeting:', processedGreeting);

    console.log('💾 Saving simple greeting message');

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

    return new Response(
      JSON.stringify({ 
        success: true, 
        chat_id: chat.id,
        message: 'Basic chat created successfully',
        needs_context_extraction: true,  // Flag to indicate context extraction needed
        addon_settings: addonSettings  // Pass addon settings for context extraction
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in create-basic-chat:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
