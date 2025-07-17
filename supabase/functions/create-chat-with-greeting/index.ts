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

  console.log('🚀 Create chat with greeting function called');

  try {
    // Get user from auth header (same pattern as chat-stream)
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

    const { character_id, character_name } = await req.json();

    if (!character_id || !character_name) {
      throw new Error('Missing character_id or character_name');
    }

    console.log('Creating chat for user:', user.id, 'character:', character_id);

    // Fetch user profile and default persona for template replacement
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
    }

    // Get user's default persona (if available)
    const { data: defaultPersona, error: personaError } = await supabase
      .from('personas')
      .select('name')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (personaError && personaError.code !== 'PGRST116') {
      console.error('Error fetching default persona:', personaError);
    }

    // Create the chat
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        character_id: character_id,
        title: `Chat with ${character_name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (chatError) {
      console.error('Error creating chat:', chatError);
      throw new Error('Failed to create chat');
    }

    console.log('Chat created:', chat.id);

    // Get character details for greeting
    const { data: characterDetails, error: charError } = await supabase
      .from('characters')
      .select(`
        *,
        character_definitions (*)
      `)
      .eq('id', character_id)
      .single();

    if (charError) {
      console.error('Error fetching character:', charError);
      throw new Error('Failed to fetch character details');
    }

    // Template replacement function (same logic as chat-stream)
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

    // Get raw greeting and apply template replacement
    const rawGreeting = characterDetails.character_definitions?.greeting || 
                       `Hello! I'm ${character_name}. It's great to meet you. What would you like to talk about?`;
    
    const processedGreeting = replaceTemplates(rawGreeting);
    console.log('✅ Processed greeting:', processedGreeting);

    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: user.id,
        content: processedGreeting,
        is_ai_message: true,
        created_at: new Date().toISOString()
      });

    if (messageError) {
      console.error('Error creating greeting message:', messageError);
      throw new Error('Failed to create greeting message');
    }

    console.log('Greeting message created for chat:', chat.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        chat_id: chat.id,
        message: 'Chat created with greeting'
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in create-chat-with-greeting:', error);
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