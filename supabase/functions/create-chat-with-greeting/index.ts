import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Context extraction utilities (copied from chat-stream)
async function extractInitialContext(
  character: any,
  addonSettings: any,
  openRouterKey: string,
  replaceTemplatesFn: (content: string) => string
) {
  if (!addonSettings || !Object.values(addonSettings).some(Boolean)) {
    console.log('No addons enabled - skipping initial context extraction');
    return null;
  }

  // Build context fields based on enabled addons only
  const enabledFields: string[] = [];
  const contextFields: any = {};
  
  if (addonSettings.moodTracking) {
    enabledFields.push('"mood": "character\'s current emotional state based on description"');
    contextFields.mood = 'mood';
  }
  if (addonSettings.clothingInventory) {
    enabledFields.push('"clothing": "character\'s clothing description if mentioned"');
    contextFields.clothing = 'clothing';
  }
  if (addonSettings.locationTracking) {
    enabledFields.push('"location": "current location or setting based on scenario"');
    contextFields.location = 'location';
  }
  if (addonSettings.timeAndWeather) {
    enabledFields.push('"time_weather": "time and weather if mentioned in scenario"');
    contextFields.time_weather = 'time_weather';
  }
  if (addonSettings.relationshipStatus) {
    enabledFields.push('"relationship": "relationship status or dynamic with user"');
    contextFields.relationship = 'relationship';
  }
  if (addonSettings.characterPosition) {
    enabledFields.push('"character_position": "character\'s physical position, posture, or stance if described"');
    contextFields.character_position = 'character_position';
  }

  if (enabledFields.length === 0) {
    console.log('No context addons enabled - skipping context extraction');
    return null;
  }

  console.log('🔧 Extracting context for enabled addons:', Object.keys(contextFields));

  const contextPrompt = `You are ${replaceTemplatesFn(character.personality_summary || 'a helpful assistant')}.

${character.description ? `Description: ${replaceTemplatesFn(character.description)}` : ''}
${character.scenario ? `Scenario: ${replaceTemplatesFn(typeof character.scenario === 'string' ? character.scenario : JSON.stringify(character.scenario))}` : ''}
${character.greeting ? `Character Greeting: ${replaceTemplatesFn(character.greeting)}` : ''}

Based on the character description, scenario, and greeting, extract initial context information for the following fields in JSON format:
{
  ${enabledFields.join(',\n  ')}
}

Return only the JSON object with no additional text. If a field is not mentioned or unclear, use "No context".`;

  try {
    const contextResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-InitialContext'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct',
        messages: [{ role: 'user', content: contextPrompt }],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (contextResponse.ok) {
      const contextData = await contextResponse.json();
      const contextStr = contextData.choices?.[0]?.message?.content || '{}';
      console.log('📝 Initial context extraction response:', contextStr);
      
      try {
        const cleanedContextStr = contextStr.trim()
          .replace(/^```json\s*/, '')
          .replace(/\s*```$/, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '');
        
        const parsedContext = JSON.parse(cleanedContextStr);
        console.log('🔍 Parsed initial context:', parsedContext);
        return parsedContext;
      } catch (parseError) {
        console.error('Failed to parse initial context JSON:', parseError);
        return null;
      }
    }
  } catch (error) {
    console.error('Initial context extraction error:', error);
  }
  return null;
}

async function saveContextUpdates(
  extractedContext: any,
  addonSettings: any,
  userId: string,
  chatId: string,
  characterId: string,
  supabase: any
) {
  if (!extractedContext || !addonSettings) return;

  const contextMappings = [
    { setting: 'moodTracking', field: 'mood', type: 'mood' },
    { setting: 'clothingInventory', field: 'clothing', type: 'clothing' },
    { setting: 'locationTracking', field: 'location', type: 'location' },
    { setting: 'timeAndWeather', field: 'time_weather', type: 'time_weather' },
    { setting: 'relationshipStatus', field: 'relationship', type: 'relationship' },
    { setting: 'characterPosition', field: 'character_position', type: 'character_position' }
  ];

  const contextUpdatePromises = [];

  for (const { setting, field, type } of contextMappings) {
    if (addonSettings[setting] && extractedContext[field]) {
      contextUpdatePromises.push(
        supabase.from('user_chat_context').upsert({
          user_id: userId,
          chat_id: chatId,
          character_id: characterId,
          context_type: type,
          current_context: extractedContext[field],
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,chat_id,character_id,context_type'
        })
      );
    }
  }

  if (contextUpdatePromises.length > 0) {
    try {
      const results = await Promise.allSettled(contextUpdatePromises);
      const failures = results.filter(r => r.status === 'rejected');
      
      if (failures.length > 0) {
        console.error('Some context updates failed:', failures);
      } else {
        console.log('✅ All context updates saved successfully');
      }
    } catch (error) {
      console.error('Context update error:', error);
    }
  }
}

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

    const requestBody = await req.json();
    const { character_id, character_name, addonSettings } = requestBody;

    if (!character_id || !character_name) {
      throw new Error('Missing character_id or character_name');
    }

    console.log('Creating chat for user:', user.id, 'character:', character_id);
    console.log('Addon settings received:', JSON.stringify(addonSettings, null, 2));

    // Get OpenRouter API key for context extraction
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    console.log('OpenRouter API key available:', !!openRouterKey);

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

    // Update chat with last_message_at timestamp
    await supabase
      .from('chats')
      .update({ 
        last_message_at: new Date().toISOString() 
      })
      .eq('id', chat.id);

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

    console.log('Character details fetched:', {
      hasDefinitions: !!characterDetails.character_definitions,
      greeting: characterDetails.character_definitions?.greeting?.substring(0, 50)
    });

    // Extract initial context from character card if addons are enabled
    let initialContext = null;
    console.log('Context extraction check:', {
      hasAddonSettings: !!addonSettings,
      anyAddonEnabled: addonSettings ? Object.values(addonSettings).some(Boolean) : false,
      hasOpenRouterKey: !!openRouterKey,
      addonValues: addonSettings ? Object.values(addonSettings) : []
    });
    
    if (addonSettings && Object.values(addonSettings).some(Boolean) && openRouterKey) {
      console.log('🔄 Extracting initial context from character card...');
      
      // Template replacement function for context extraction
      const replaceTemplatesForContext = (content: string): string => {
        if (!content) return content;
        
        const userName = defaultPersona?.name || userProfile?.username || 'User';
        const charName = character_name || 'Character';
        
        return content
          .replace(/\{\{user\}\}/g, userName)
          .replace(/\{\{char\}\}/g, charName);
      };

      // Extract context using character definition data
      const characterForContext = {
        personality_summary: characterDetails.character_definitions?.personality_summary || '',
        description: characterDetails.character_definitions?.description || '',
        scenario: characterDetails.character_definitions?.scenario || '',
        greeting: characterDetails.character_definitions?.greeting || ''
      };

      initialContext = await extractInitialContext(
        characterForContext,
        addonSettings,
        openRouterKey,
        replaceTemplatesForContext
      );

      // Save initial context to database
      if (initialContext) {
        console.log('💾 Saving initial context to database...');
        await saveContextUpdates(initialContext, addonSettings, user.id, chat.id, character_id, supabase);
      }
    } else {
      console.log('⏭️ Skipping context extraction - no addons enabled or missing API key');
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

    // Build initial context object for the message
    const messageContext = {};
    if (initialContext && addonSettings) {
      Object.entries(initialContext).forEach(([field, value]) => {
        if (value && value !== 'No context') {
          const contextKey = field === 'mood' ? 'moodTracking' :
                           field === 'clothing' ? 'clothingInventory' :
                           field === 'location' ? 'locationTracking' :
                           field === 'time_weather' ? 'timeAndWeather' :
                           field === 'relationship' ? 'relationshipStatus' :
                           field === 'character_position' ? 'characterPosition' : null;
          if (contextKey && addonSettings[contextKey]) {
            messageContext[contextKey] = value;
          }
        }
      });
    }

    console.log('💾 Saving greeting message with context:', messageContext);

    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,  // AI messages should have NULL author_id (not user's ID!)
        content: processedGreeting,
        is_ai_message: true,
        current_context: Object.keys(messageContext).length > 0 ? messageContext : null,
        message_order: 1,  // First message in the chat
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
