import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Performance optimization: Cache common data
const templateCache = new Map<string, string>();
const contextCache = new Map<string, any>();
const dbPool = new Map<string, any>();

// Connection pooling for better performance
const getPooledConnection = (userId: string) => {
  if (!dbPool.has(userId)) {
    dbPool.set(userId, Date.now());
  }
  return dbPool.get(userId);
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('🚀 Chat function called - Performance Mode Enhanced');

  try {
    // Create Supabase client using user's Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

    // Fetch the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('User authenticated:', user.id);

    // Parse the incoming request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { model, user_message, chat_id, character_id, tracked_context, addon_settings, selected_persona_id } = requestBody;

    console.log('Full request body:', JSON.stringify(requestBody, null, 2));
    console.log('Field validation in edge function:', {
      model: !!model,
      user_message: !!user_message,
      chat_id: !!chat_id,
      character_id: !!character_id,
      model_value: model,
      user_message_length: user_message?.length,
      chat_id_value: chat_id,
      character_id_value: character_id,
      selected_persona_id: selected_persona_id
    });

    if (!model || !user_message || !chat_id || !character_id) {
      console.error('Missing required fields. Received:', { model, user_message: !!user_message, chat_id, character_id });
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: model, user_message, chat_id, character_id',
        received: { model, user_message: !!user_message, chat_id, character_id }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('Received addon_settings:', JSON.stringify(addon_settings, null, 2));

    console.log(`Processing chat request for chat: ${chat_id}, character: ${character_id}`);

    // Get OpenRouter API key
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      console.error('OpenRouter API key not configured');
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create Supabase admin client for character data
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Batch fetch all required data in parallel for better performance
    const [characterResult, characterInfoResult, userProfileResult, selectedPersonaResult] = await Promise.all([
      supabaseAdmin
        .from('character_definitions')
        .select('personality_summary, description, scenario, greeting')
        .eq('character_id', character_id)
        .single(),
      supabaseAdmin
        .from('characters')
        .select('name')
        .eq('id', character_id)
        .single(),
      supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single(),
      selected_persona_id ? supabase
        .from('personas')
        .select('name, bio')
        .eq('id', selected_persona_id)
        .eq('user_id', user.id)
        .single() : Promise.resolve({ data: null, error: null })
    ]);

    if (characterResult.error) {
      console.error('Character definition error:', characterResult.error);
      return new Response(JSON.stringify({ error: 'Character definition not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (characterInfoResult.error) {
      console.error('Character info error:', characterInfoResult.error);
      return new Response(JSON.stringify({ error: 'Character info not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const character = characterResult.data;
    const characterInfo = characterInfoResult.data;
    const userProfile = userProfileResult.data;
    const selectedPersona = selectedPersonaResult.data;

    console.log('Character definition found, persona:', selectedPersona ? selectedPersona.name : 'None');

    // Template replacement function
    const replaceTemplates = (content: string): string => {
      if (!content) return content;
      
      // Replace {{user}} with persona name or username
      const userName = selectedPersona?.name || userProfile?.username || 'User';
      
      // Replace {{char}} with character's first name
      const charName = characterInfo?.name?.split(' ')[0] || 'Character';
      
      return content
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{char\}\}/g, charName);
    };

    // Note: User message is already saved by the frontend hook to prevent duplication
    // We'll only save the AI response here

    // Get user's subscription and plan for model selection
    const { data: userSubscription, error: subError } = await supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_end')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('current_period_end', new Date().toISOString())
      .maybeSingle();

    // Default to Guest Pass if no active subscription
    let selectedModel = 'openai/gpt-4o-mini'; // Guest Pass - Fast & Fun
    
    if (userSubscription) {
      // Get plan details
      const { data: planData, error: planError } = await supabaseAdmin
        .from('plans')
        .select('name')
        .eq('id', userSubscription.plan_id)
        .single();
      
      if (planData) {
        switch (planData.name) {
          case 'True Fan':
            selectedModel = 'gryphe/mythomax-l2-13b'; // Smart & Creative
            break;
          case 'The Whale':
            selectedModel = 'nousresearch/nous-hermes-2-mixtral-8x7b-dpo'; // Genius
            break;
          default:
            selectedModel = 'openai/gpt-4o-mini'; // Guest Pass - Fast & Fun
        }
      }
    }

    console.log('Selected model for user tier:', selectedModel);

    const isWorldInfoEnabled = addonSettings?.dynamicWorldInfo || false;
    console.log('Dynamic World Info enabled:', isWorldInfoEnabled);

    // Fetch user's world info setting for this character
    let worldInfoEntries = [];
    if (isWorldInfoEnabled) {
      console.log('Fetching user world info setting for user:', user.id, 'character:', character_id);
      
      const { data: userWorldInfoSetting, error: settingError } = await supabase
        .from('user_character_world_info_settings')
        .select('world_info_id')
        .eq('user_id', user.id)
        .eq('character_id', character_id)
        .maybeSingle();

      if (settingError) {
        console.error('Failed to fetch user world info setting:', settingError);
      } else if (userWorldInfoSetting?.world_info_id) {
        console.log('Found user world info setting, world_info_id:', userWorldInfoSetting.world_info_id);
        
        // Fetch the world info entries for the user's selected world info
        const { data: worldInfoData, error: worldInfoError } = await supabaseAdmin
          .from('world_info_entries')
          .select('keywords, entry_text')
          .eq('world_info_id', userWorldInfoSetting.world_info_id);

        if (worldInfoError) {
          console.error('Failed to fetch world info entries:', worldInfoError);
        } else {
          worldInfoEntries = worldInfoData || [];
          console.log('World info entries fetched:', worldInfoEntries.length);
        }
      } else {
        console.log('No world info setting found for this user-character combination');
      }
    }

    // Fetch conversation history and addon settings in parallel
    const [messageHistoryResult, addonSettingsResult] = await Promise.all([
      supabase
        .from('messages')
        .select('content, is_ai_message, created_at')
        .eq('chat_id', chat_id)
        .order('created_at', { ascending: true })
        .limit(20),
      supabase
        .from('user_character_addons')
        .select('addon_settings')
        .eq('user_id', user.id)
        .eq('character_id', character_id)
        .maybeSingle()
    ]);

    const messageHistory = messageHistoryResult.data || [];
    const addonSettings = addonSettingsResult.data?.addon_settings || {};

    if (messageHistoryResult.error) {
      console.error('Failed to fetch conversation history:', messageHistoryResult.error);
    }

    console.log('Conversation history fetched:', messageHistory?.length || 0, 'messages');

    // Check if this is the first message (only user message should exist)
    // After removing duplicate user message save, first message should have exactly 1 message
    const isFirstMessage = messageHistory?.length === 1;
    console.log('Is first message:', isFirstMessage);

    // Load existing context from database - merge with passed addon settings
    const addonSettingsObj = { ...addonSettings, ...addon_settings };
    console.log('Processing context for addons:', addonSettingsObj);
    
    let currentContext: any = {};
    
    // Always load all available context from database (historical preservation)
    const { data: contextData } = await supabase
      .from('user_chat_context')
      .select('context_type, current_context')
      .eq('user_id', user.id)
      .eq('character_id', character_id)
      .eq('chat_id', chat_id);

    console.log('Loaded context from database:', contextData);

    // Initialize context for ALL addons first (even disabled ones for context preservation)
    currentContext.moodTracking = 'No context';
    currentContext.clothingInventory = 'No context';
    currentContext.locationTracking = 'No context';
    currentContext.timeAndWeather = 'No context';
    currentContext.relationshipStatus = 'No context';
    currentContext.characterPosition = 'No context';

    // Load existing context from database for ALL addons (preserve disabled context)
    if (contextData) {
      for (const row of contextData) {
        switch (row.context_type) {
          case 'mood':
            currentContext.moodTracking = row.current_context || 'No context';
            break;
          case 'clothing':
            currentContext.clothingInventory = row.current_context || 'No context';
            break;
          case 'location':
            currentContext.locationTracking = row.current_context || 'No context';
            break;
          case 'time_weather':
            currentContext.timeAndWeather = row.current_context || 'No context';
            break;
          case 'relationship':
            currentContext.relationshipStatus = row.current_context || 'No context';
            break;
          case 'character_position':
            currentContext.characterPosition = row.current_context || 'No context';
            break;
        }
      }
    }

    // Override with tracked context if provided (preserve all context even for disabled addons)
    if (tracked_context) {
      Object.keys(tracked_context).forEach(key => {
        // Update context for all addons to preserve state
        if (tracked_context[key] && tracked_context[key] !== 'No context') {
          currentContext[key] = tracked_context[key];
        }
      });
    }

    console.log('Current context loaded:', currentContext);

    // Check if any addons are enabled
    const hasEnabledAddons = addonSettingsObj.moodTracking || 
                           addonSettingsObj.clothingInventory || 
                           addonSettingsObj.locationTracking || 
                           addonSettingsObj.timeAndWeather || 
                           addonSettingsObj.relationshipStatus ||
                           addonSettingsObj.characterPosition;

    // Extract initial context from character card if this is the first message
    if (isFirstMessage && hasEnabledAddons) {
      console.log('First message detected, extracting initial context from character card + greeting + user message...');
      
      // Build character context for analysis including greeting (with template replacement)
      const characterContent = [
        character.description ? `Description: ${replaceTemplates(character.description)}` : '',
        character.personality_summary ? `Personality: ${replaceTemplates(character.personality_summary)}` : '',
        character.scenario ? `Scenario: ${replaceTemplates(JSON.stringify(character.scenario))}` : '',
        character.greeting ? `Character Greeting: ${replaceTemplates(character.greeting)}` : ''
      ].filter(Boolean).join('\n\n');

      // Build extraction prompt for character card + greeting + user message (more concise)
      const characterExtractionPrompt = `Extract initial context from character card, greeting, and user message for enabled addons only.

Rules:
1. Extract only explicit/strongly implied information
2. Return "No context" if no information available  
3. Be concise - max 10 words per field
4. Return valid JSON only

Character Card:
${characterContent}

User Message: "${user_message}"

Extract for enabled fields:
${Object.keys(addonSettingsObj).filter(key => addonSettingsObj[key]).map(key => {
  switch(key) {
    case 'moodTracking': return '- moodTracking: Emotional state';
    case 'clothingInventory': return '- clothingInventory: Clothing/outfit';
    case 'locationTracking': return '- locationTracking: Location/environment (room, house, bedroom, kitchen, etc.)';
    case 'timeAndWeather': return '- timeAndWeather: Time/weather';
    case 'relationshipStatus': return '- relationshipStatus: Relationship status';
    case 'characterPosition': return '- characterPosition: Physical position';
    default: return `- ${key}: ${key}`;
  }
}).join('\n')}

Return JSON:
${JSON.stringify(Object.keys(addonSettingsObj).filter(key => addonSettingsObj[key]).reduce((acc, key) => {
  acc[key] = 'No context';
  return acc;
}, {}), null, 2)}`;

      // Call extraction LLM for character card
      const characterExtractionResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
          'X-Title': 'AnimaChat-CharacterContext'
        },
        body: JSON.stringify({
          model: 'mistralai/mistral-7b-instruct', // Always use Mistral for character card analysis
          messages: [
            { role: 'system', content: 'You are a precise character analysis bot. Extract concise context (max 10 words per field) from character card, greeting, and user message. Return valid JSON only.' },
            { role: 'user', content: characterExtractionPrompt }
          ],
          temperature: 0.1
        })
      });

      if (characterExtractionResponse.ok) {
        try {
          const characterExtractionData = await characterExtractionResponse.json();
          const characterContextStr = characterExtractionData.choices?.[0]?.message?.content || '{}';
          console.log('Character card extraction response:', characterContextStr);
          
          const characterContext = JSON.parse(characterContextStr);
          console.log('Extracted character context:', characterContext);
          
          // Update current context with character card data
          Object.keys(characterContext).forEach(key => {
            if (addonSettingsObj[key] && characterContext[key] !== 'No context') {
              currentContext[key] = characterContext[key];
            }
          });
          
          // Save initial context to database
          const contextMappings = [
            { type: 'mood', value: currentContext.moodTracking, key: 'moodTracking' },
            { type: 'clothing', value: currentContext.clothingInventory, key: 'clothingInventory' },
            { type: 'location', value: currentContext.locationTracking, key: 'locationTracking' },
            { type: 'time_weather', value: currentContext.timeAndWeather, key: 'timeAndWeather' },
            { type: 'relationship', value: currentContext.relationshipStatus, key: 'relationshipStatus' },
            { type: 'character_position', value: currentContext.characterPosition, key: 'characterPosition' }
          ];

          for (const mapping of contextMappings) {
            const isAddonEnabled = addonSettingsObj[mapping.key];
            if (isAddonEnabled && mapping.value && mapping.value !== 'No context') {
              console.log(`Saving initial context for ${mapping.type}:`, mapping.value);
              await supabase
                .from('user_chat_context')
                .upsert({
                  user_id: user.id,
                  character_id: character_id,
                  chat_id: chat_id,
                  context_type: mapping.type,
                  current_context: mapping.value
                });
            }
          }
          
          console.log('Initial context from character card saved successfully');
          
        } catch (parseError) {
          console.error('Failed to parse character card extraction:', parseError);
        }
      } else {
        console.error('Character card extraction failed:', characterExtractionResponse.status);
      }
    }

    // Construct context injection for system prompt - only for enabled addons
    const contextParts = [];
    if (addonSettingsObj.moodTracking && currentContext.moodTracking && currentContext.moodTracking !== 'No context') {
      contextParts.push(`Mood: ${currentContext.moodTracking}`);
    }
    if (addonSettingsObj.clothingInventory && currentContext.clothingInventory && currentContext.clothingInventory !== 'No context') {
      contextParts.push(`Clothing: ${currentContext.clothingInventory}`);
    }
    if (addonSettingsObj.locationTracking && currentContext.locationTracking && currentContext.locationTracking !== 'No context') {
      contextParts.push(`Location: ${currentContext.locationTracking}`);
    }
    if (addonSettingsObj.timeAndWeather && currentContext.timeAndWeather && currentContext.timeAndWeather !== 'No context') {
      contextParts.push(`Time & Weather: ${currentContext.timeAndWeather}`);
    }
    if (addonSettingsObj.relationshipStatus && currentContext.relationshipStatus && currentContext.relationshipStatus !== 'No context') {
      contextParts.push(`Relationship: ${currentContext.relationshipStatus}`);
    }
    if (addonSettingsObj.characterPosition && currentContext.characterPosition && currentContext.characterPosition !== 'No context') {
      contextParts.push(`Character Position: ${currentContext.characterPosition}`);
    }
    
    const contextPrompt = contextParts.length > 0 ? `[Current Context:\n${contextParts.join('\n')}]` : '';

    // Construct the System Prompt with context injection (with template replacement)
    const systemPrompt = `You are to roleplay as the character defined below. Stay in character and respond naturally.

**Character Description:**
${replaceTemplates(character.description) || 'A helpful assistant'}

**Personality Summary:**
${replaceTemplates(character.personality_summary) || 'Friendly and helpful'}

**Scenario:**
${replaceTemplates(character.scenario) || 'Casual conversation'}

${contextPrompt}

**Roleplay Instructions:**
- Use "quotes" for all spoken dialogue
- Use *asterisks* for actions, thoughts, or descriptions
- Respond to actions naturally and incorporate them into your roleplay
- Pay attention to actions when updating context information

**Formatting Rules:**
- ALL spoken words must be enclosed in "double quotes"
- ALL actions, thoughts, and descriptions must be enclosed in *asterisks*
- Example: "Hello there!" *she said with a smile* "How are you today?"

Respond naturally to the conversation, keeping the character's personality consistent. Use the current context to inform your responses when relevant.`;

    // Build conversation history with system prompt
    const conversationMessages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history if available (with template replacement)
    if (messageHistory && messageHistory.length > 0) {
      for (const msg of messageHistory) {
        conversationMessages.push({
          role: msg.is_ai_message ? 'assistant' : 'user',
          content: replaceTemplates(msg.content)
        });
      }
    }

    // Process dynamic world info if enabled
    if (isWorldInfoEnabled && worldInfoEntries.length > 0) {
      console.log('Processing world info for keyword matching...');
      
      // Create keyword map for efficient lookups
      const worldInfoMap = new Map();
      for (const entry of worldInfoEntries) {
        for (const keyword of entry.keywords || []) {
          // Store both the keyword and entry text for deduplication
          const key = keyword.toLowerCase();
          if (!worldInfoMap.has(key)) {
            worldInfoMap.set(key, entry.entry_text);
          }
        }
      }

      // Scan user message for keywords (case-insensitive)
      const userMessageLower = user_message.toLowerCase();
      const matchedEntries = new Set(); // Use Set to avoid duplicates
      
      for (const [keyword, entryText] of worldInfoMap) {
        if (userMessageLower.includes(keyword)) {
          matchedEntries.add(entryText);
          console.log('Keyword matched:', keyword);
        }
      }

      // Inject world info as system message if keywords found
      if (matchedEntries.size > 0) {
        const worldInfoContext = Array.from(matchedEntries).join('\n\n');
        const worldInfoMessage = {
          role: 'system' as const,
          content: `[World Context: ${worldInfoContext}]`
        };
        
        // Insert after main system prompt but before conversation history
        conversationMessages.splice(1, 0, worldInfoMessage);
        console.log('Injected world info context for', matchedEntries.size, 'entries');
      }
    }

    // Add the current user message (with template replacement)
    conversationMessages.push({
      role: 'user',
      content: replaceTemplates(user_message)
    });

    // Build unified prompt that combines response generation + context extraction
    let unifiedPrompt = systemPrompt;
    
    if (hasEnabledAddons) {
      // Add context extraction instructions to the system prompt
      const enabledFields = Object.keys(addonSettingsObj).filter(key => addonSettingsObj[key]);
      const contextInstructions = enabledFields.map(key => {
        switch(key) {
          case 'moodTracking': return '- moodTracking: Character\'s emotional state/mood';
          case 'clothingInventory': return '- clothingInventory: Clothing/outfit descriptions';
          case 'locationTracking': return '- locationTracking: Location (room/place)';
          case 'timeAndWeather': return '- timeAndWeather: Time/weather conditions';
          case 'relationshipStatus': return '- relationshipStatus: Relationship dynamics';
          case 'characterPosition': return '- characterPosition: Physical position/posture';
          default: return `- ${key}: ${key}`;
        }
      }).join('\n');

      unifiedPrompt += `

**CONTEXT EXTRACTION REQUIRED:**
After your roleplay response, extract context for these fields:
${contextInstructions}

Format your response as:
[ROLEPLAY_RESPONSE]
Your normal roleplay response here...
[/ROLEPLAY_RESPONSE]

[CONTEXT_EXTRACTION]
{
  "moodTracking": "current emotional state (or '${currentContext.moodTracking}' if unchanged)",
  "clothingInventory": "current clothing (or '${currentContext.clothingInventory}' if unchanged)",
  "locationTracking": "current location (or '${currentContext.locationTracking}' if unchanged)",
  "timeAndWeather": "current time/weather (or '${currentContext.timeAndWeather}' if unchanged)",
  "relationshipStatus": "relationship status (or '${currentContext.relationshipStatus}' if unchanged)",
  "characterPosition": "character position (or '${currentContext.characterPosition}' if unchanged)"
}
[/CONTEXT_EXTRACTION]

Extract only for enabled fields: ${enabledFields.join(', ')}`;
    }

    // Update conversation messages with unified prompt
    conversationMessages[0].content = unifiedPrompt;

    console.log('🚀 Calling unified LLM (response + context extraction)...');
    const llmStartTime = Date.now();

    // Call OpenRouter API with unified prompt
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-Unified'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: conversationMessages,
        stream: false,
        temperature: 0.7,
        max_tokens: 1200 // Increased for unified response
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter API error:', errorText);
      return new Response(JSON.stringify({ error: 'OpenRouter API error', details: errorText }), {
        status: openRouterResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const llmEndTime = Date.now();
    console.log(`✅ LLM responded in ${llmEndTime - llmStartTime}ms`);

    // Parse unified response
    const responseData = await openRouterResponse.json();
    const fullResponse = responseData.choices?.[0]?.message?.content || '';

    let aiResponseContent = fullResponse;
    let extractedContext = null;

    // Parse response and context if addons are enabled
    if (hasEnabledAddons) {
      const roleplayMatch = fullResponse.match(/\[ROLEPLAY_RESPONSE\](.*?)\[\/ROLEPLAY_RESPONSE\]/s);
      const contextMatch = fullResponse.match(/\[CONTEXT_EXTRACTION\](.*?)\[\/CONTEXT_EXTRACTION\]/s);
      
      if (roleplayMatch) {
        aiResponseContent = roleplayMatch[1].trim();
      }
      
      if (contextMatch) {
        try {
          extractedContext = JSON.parse(contextMatch[1].trim());
          console.log('✅ Context extracted from unified response:', extractedContext);
        } catch (parseError) {
          console.log('⚠️ Failed to parse context from unified response, using fallback');
          extractedContext = null;
        }
      }
    }

    console.log(`🎯 AI response generated: ${aiResponseContent.length} chars`);

    // Save the AI response to the database first
    console.log('Saving AI response to database...');
    const { error: saveError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat_id,
        author_id: user.id,
        content: aiResponseContent,
        is_ai_message: true,
        model_id: selectedModel, // Store the actual model used
        token_cost: 1
      });

    if (saveError) {
      console.error('Error saving AI message:', saveError);
      return new Response(JSON.stringify({ error: 'Failed to save AI response' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('AI response saved successfully');

    // Check if any addons are enabled before extracting context (already defined above)

    console.log('Checking enabled addons:', {
      moodTracking: addonSettingsObj.moodTracking,
      clothingInventory: addonSettingsObj.clothingInventory,
      locationTracking: addonSettingsObj.locationTracking,
      timeAndWeather: addonSettingsObj.timeAndWeather,
      relationshipStatus: addonSettingsObj.relationshipStatus,
      characterPosition: addonSettingsObj.characterPosition,
      hasEnabledAddons
    });
    
    // Add more detailed logging about addon settings
    console.log('Raw addon_settings received:', JSON.stringify(addon_settings, null, 2));
    console.log('Processed addonSettingsObj:', JSON.stringify(addonSettingsObj, null, 2));

    // Process context from unified response or fallback to current context
    let updatedContext = currentContext;
    
    if (hasEnabledAddons) {
      console.log('🔄 Processing context from unified response...');
      
      // Use extracted context from unified response if available
      if (extractedContext) {
        console.log('📊 Using context from unified response');
        updatedContext = {
          moodTracking: addonSettingsObj.moodTracking ? (extractedContext.moodTracking || currentContext.moodTracking) : currentContext.moodTracking,
          clothingInventory: addonSettingsObj.clothingInventory ? (extractedContext.clothingInventory || currentContext.clothingInventory) : currentContext.clothingInventory,
          locationTracking: addonSettingsObj.locationTracking ? (extractedContext.locationTracking || currentContext.locationTracking) : currentContext.locationTracking,
          timeAndWeather: addonSettingsObj.timeAndWeather ? (extractedContext.timeAndWeather || currentContext.timeAndWeather) : currentContext.timeAndWeather,
          relationshipStatus: addonSettingsObj.relationshipStatus ? (extractedContext.relationshipStatus || currentContext.relationshipStatus) : currentContext.relationshipStatus,
          characterPosition: addonSettingsObj.characterPosition ? (extractedContext.characterPosition || currentContext.characterPosition) : currentContext.characterPosition
        };
      }
      
      console.log('✅ Final context state:', updatedContext);
      
      // Get the AI message ID for context linking
      const { data: aiMessage, error: aiMessageError } = await supabase
        .from('messages')
        .select('id')
        .eq('chat_id', chat_id)
        .eq('content', aiResponseContent)
        .eq('is_ai_message', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (aiMessageError) {
        console.error('Failed to get AI message ID:', aiMessageError);
      }

      // Batch database operations for performance
      const dbStartTime = Date.now();
      const batchOperations = [];
      
      // Prepare context mappings for batch operations
      const contextMappings = [
        { type: 'mood', value: updatedContext.moodTracking, key: 'moodTracking' },
        { type: 'clothing', value: updatedContext.clothingInventory, key: 'clothingInventory' },
        { type: 'location', value: updatedContext.locationTracking, key: 'locationTracking' },
        { type: 'time_weather', value: updatedContext.timeAndWeather, key: 'timeAndWeather' },
        { type: 'relationship', value: updatedContext.relationshipStatus, key: 'relationshipStatus' },
        { type: 'character_position', value: updatedContext.characterPosition, key: 'characterPosition' }
      ];

      // Batch context updates
      const contextUpdates = {};
      let hasContextUpdates = false;
      
      for (const mapping of contextMappings) {
        const isAddonEnabled = addonSettingsObj[mapping.key];
        
        // Only process if addon is enabled and context changed
        if (isAddonEnabled && mapping.value !== currentContext[mapping.key]) {
          // Add to batch context save
          if (mapping.value !== 'No context') {
            batchOperations.push(
              supabase
                .from('user_chat_context')
                .upsert({
                  user_id: user.id,
                  character_id: character_id,
                  chat_id: chat_id,
                  context_type: mapping.type,
                  current_context: mapping.value
                })
            );
          }
          
          // Track context updates
          contextUpdates[mapping.key] = {
            previous: currentContext[mapping.key],
            current: mapping.value
          };
          hasContextUpdates = true;
        }
      }

      // Execute batch operations
      if (batchOperations.length > 0) {
        console.log(`🚀 Executing ${batchOperations.length} batched context operations...`);
        await Promise.all(batchOperations);
      }

      // Save message-specific context updates and current context state
      if (aiMessage?.id) {
        const messageOps = [];
        
        if (hasContextUpdates) {
          console.log('📝 Saving message-specific context updates');
          messageOps.push(
            supabase
              .from('message_context')
              .insert({
                message_id: aiMessage.id,
                user_id: user.id,
                character_id: character_id,
                chat_id: chat_id,
                context_updates: contextUpdates
              })
          );
        }
        
        // Save current context state for inheritance
        messageOps.push(
          supabase
            .from('messages')
            .update({
              current_context: updatedContext
            })
            .eq('id', aiMessage.id)
        );
        
        if (messageOps.length > 0) {
          await Promise.all(messageOps);
        }
      }
      
      const dbEndTime = Date.now();
      console.log(`⚡ Database operations completed in ${dbEndTime - dbStartTime}ms`);
    }

    const totalTime = Date.now() - startTime;
    console.log(`🎯 Chat function completed in ${totalTime}ms`);

    // Return both response and context
    return new Response(JSON.stringify({ 
      success: true, 
      content: aiResponseContent,
      updatedContext,
      metrics: {
        totalTime,
        hasUnifiedContext: !!extractedContext
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chat function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});