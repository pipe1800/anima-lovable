import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

// ============================================================================
// SHARED UTILITIES (Consolidated for Supabase Deployment)
// ============================================================================

interface AuthResult {
  user: any;
  supabase: any;
  supabaseAdmin: any;
}

interface TemplateContext {
  userName?: string;
  charName?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
};

// Authentication utilities - Exact copy from working function
async function authenticateUser(req: Request): Promise<AuthResult> {
  console.log('🔐 Starting authentication...');
  
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    console.error('❌ No authorization header found');
    throw new Error('No authorization header');
  }

  console.log('🔐 Auth header found:', authHeader.substring(0, 20) + '...');

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

  console.log('🔐 Supabase client created, validating user...');

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  console.log('🔐 Auth validation result:', {
    hasUser: !!user,
    userId: user?.id,
    error: authError?.message || 'none'
  });

  if (authError || !user) {
    console.error('❌ Authentication failed:', authError);
    throw new Error('Invalid token');
  }

  // Create admin client for privileged operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  console.log('✅ User authenticated successfully:', user.id);
  return { user, supabase, supabaseAdmin };
}

function createCorsResponse(data: any = null, status = 200) {
  return new Response(data ? JSON.stringify(data) : null, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function createErrorResponse(error: string, status = 500) {
  return createCorsResponse({ error }, status);
}

// Template utilities
function replaceTemplates(content: string, context: TemplateContext): string {
  if (!content || typeof content !== 'string') return content || '';
  
  const { userName = 'User', charName = 'Character' } = context;
  
  console.log('🔧 Template replacement - userName:', userName, 'charName:', charName);
  
  try {
    const replaced = content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
      
    if (content !== replaced) {
      console.log('🔄 Template replaced:', content.substring(0, 50) + '...', '->', replaced.substring(0, 50) + '...');
    }
    
    return replaced;
  } catch (error) {
    console.error('Template replacement error:', error);
    return content;
  }
}

function buildSystemPrompt(
  character: any, 
  addonSettings: any,
  templateContext: TemplateContext,
  currentContext?: any
): string {
  let systemPrompt = `You are ${replaceTemplates(character.personality_summary || 'a helpful assistant', templateContext)}.
    
${character.description ? `Description: ${replaceTemplates(character.description, templateContext)}` : ''}
${character.scenario ? `Scenario: ${replaceTemplates(typeof character.scenario === 'string' ? character.scenario : JSON.stringify(character.scenario), templateContext)}` : ''}

IMPORTANT DIALOGUE GUIDELINES:
- Focus primarily on dialogue and conversation
- Use direct speech frequently with quotation marks
- Keep narrative descriptions brief and essential
- Respond with natural, engaging conversation
- Express emotions and thoughts through words and dialogue
- Avoid lengthy descriptive paragraphs
- Make your character feel alive through speech

Stay in character and engage in natural dialogue with the user.`;

  // Add current context if available and relevant addons are enabled
  if (currentContext && addonSettings) {
    const contextParts = [];
    
    if (addonSettings.moodTracking && currentContext.moodTracking && currentContext.moodTracking !== 'No context') {
      contextParts.push(`Current Mood: ${currentContext.moodTracking}`);
    }
    if (addonSettings.clothingInventory && currentContext.clothingInventory && currentContext.clothingInventory !== 'No context') {
      contextParts.push(`Current Clothing: ${currentContext.clothingInventory}`);
    }
    if (addonSettings.locationTracking && currentContext.locationTracking && currentContext.locationTracking !== 'No context') {
      contextParts.push(`Current Location: ${currentContext.locationTracking}`);
    }
    if (addonSettings.timeAndWeather && currentContext.timeAndWeather && currentContext.timeAndWeather !== 'No context') {
      contextParts.push(`Time & Weather: ${currentContext.timeAndWeather}`);
    }
    if (addonSettings.relationshipStatus && currentContext.relationshipStatus && currentContext.relationshipStatus !== 'No context') {
      contextParts.push(`Relationship Status: ${currentContext.relationshipStatus}`);
    }
    if (addonSettings.characterPosition && currentContext.characterPosition && currentContext.characterPosition !== 'No context') {
      contextParts.push(`Character Position: ${currentContext.characterPosition}`);
    }
    
    if (contextParts.length > 0) {
      systemPrompt += '\n\n[CURRENT CONTEXT]\n' + contextParts.join('\n') + '\n[/CURRENT CONTEXT]';
    }
  }

  // Add addon context if enabled
  if (addonSettings) {
    if (addonSettings.enhancedMemory) {
      systemPrompt += '\n\nRemember details from previous conversations and reference them naturally.';
    }
    if (addonSettings.moodTracking) {
      systemPrompt += '\n\nPay attention to emotional context and respond appropriately to the user\'s mood.';
    }
    if (addonSettings.dynamicWorldInfo) {
      systemPrompt += '\n\nUse relevant world information to enhance your responses.';
    }
  }

  return systemPrompt;
}

// Context utilities
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

  const contextPrompt = `You are ${replaceTemplatesFn(character.personality_summary || 'a helpful assistant')}.

${character.description ? `Description: ${replaceTemplatesFn(character.description)}` : ''}
${character.scenario ? `Scenario: ${replaceTemplatesFn(typeof character.scenario === 'string' ? character.scenario : JSON.stringify(character.scenario))}` : ''}
${character.greeting ? `Character Greeting: ${replaceTemplatesFn(character.greeting)}` : ''}

Based on the character description, scenario, and greeting, extract initial context information for the following fields in JSON format:
{
  "mood": "character's current emotional state based on description",
  "location": "current location or setting based on scenario", 
  "clothing": "character's clothing description if mentioned",
  "time_weather": "time and weather if mentioned in scenario",
  "relationship": "relationship status or dynamic with user",
  "character_position": "character's physical position, posture, or stance if described"
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

async function extractContextFromResponse(
  character: any,
  conversationContext: any[],
  message: string,
  aiResponse: string,
  addonSettings: any,
  openRouterKey: string,
  replaceTemplatesFn: (content: string) => string,
  supabase: any,
  userId: string,
  chatId: string,
  characterId: string
) {
  if (!addonSettings || !Object.values(addonSettings).some(Boolean)) {
    console.log('No addons enabled - skipping context extraction');
    return null;
  }

  // Build context fields based on enabled addons only
  const enabledFields: string[] = [];
  const contextFields: any = {};
  
  if (addonSettings.moodTracking) {
    enabledFields.push('"mood": "character\'s current emotional state"');
    contextFields.mood = 'mood';
  }
  if (addonSettings.clothingInventory) {
    enabledFields.push('"clothing": "current clothing description"');
    contextFields.clothing = 'clothing';
  }
  if (addonSettings.locationTracking) {
    enabledFields.push('"location": "current location or setting"');
    contextFields.location = 'location';
  }
  if (addonSettings.timeAndWeather) {
    enabledFields.push('"time_weather": "current time and weather"');
    contextFields.time_weather = 'time_weather';
  }
  if (addonSettings.relationshipStatus) {
    enabledFields.push('"relationship": "relationship status/dynamic"');
    contextFields.relationship = 'relationship';
  }
  if (addonSettings.characterPosition) {
    enabledFields.push('"character_position": "character\'s physical position, posture, or stance"');
    contextFields.character_position = 'character_position';
  }

  if (enabledFields.length === 0) {
    console.log('No context addons enabled - skipping context extraction');
    return null;
  }

  console.log('🔧 Extracting context for enabled addons:', Object.keys(contextFields));

  // Note: We deliberately DON'T fetch or show current context to avoid contamination
  // The LLM should determine context purely from the conversation exchange

  // IMPROVED PROMPT - Focus on the conversation exchange, avoid context contamination
  const contextPrompt = `You are analyzing a conversation between a user and a character to extract context information.

CONVERSATION EXCHANGE:
User said: "${message}"
Character responded: "${aiResponse}"

Your task: Determine the CURRENT STATE of each context field based on what's happening in this conversation exchange.

CRITICAL RULES:
- COMPLETELY REPLACE field values, do not append or combine with previous values
- If something changes in the conversation, use the NEW value only
- If nothing is mentioned about a field in this exchange, return "No context"
- Be precise and specific (max 8 words per field)
- Focus on what the USER and CHARACTER are doing/saying RIGHT NOW

Extract the CURRENT context in JSON format:
{
  ${enabledFields.join(',\n  ')}
}

Examples of GOOD responses:
- "red evening dress" (not "maid uniform, red evening dress")
- "happy and excited" (not "sad, happy and excited") 
- "bedroom" (not "kitchen, bedroom")

Return ONLY the JSON object with no additional text.`;

  try {
    const contextResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-Context'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct',
        messages: [{ role: 'user', content: contextPrompt }], // Simple user prompt, no system message
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (contextResponse.ok) {
      const contextData = await contextResponse.json();
      const contextStr = contextData.choices?.[0]?.message?.content || '{}';
      console.log('📝 Raw context extraction response:', contextStr);
      
      try {
        // Clean the response to ensure it's valid JSON
        const cleanedContextStr = contextStr.trim()
          .replace(/^```json\s*/, '')
          .replace(/\s*```$/, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '');
        
        const parsedContext = JSON.parse(cleanedContextStr);
        console.log('🔍 Parsed context:', parsedContext);
        
        // Ensure we have values for all enabled fields (but don't contaminate with old context)
        for (const [fieldKey, fieldType] of Object.entries(contextFields)) {
          if (!parsedContext[fieldKey]) {
            // Only set to "No context" if the field is missing - don't use old values
            parsedContext[fieldKey] = 'No context';
          }
        }
        
        return parsedContext;
      } catch (parseError) {
        console.error('Failed to parse context JSON:', parseError);
        console.error('Raw context string:', contextStr);
        return null;
      }
    }
  } catch (error) {
    console.error('Context extraction error:', error);
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
      const newValue = extractedContext[field];
      
      // Only update if we got a meaningful value (not "No context")
      if (newValue !== 'No context') {
        console.log(`💾 Updating ${type} context:`, newValue);
        contextUpdatePromises.push(
          supabase.from('user_chat_context').upsert({
            user_id: userId,
            chat_id: chatId,
            character_id: characterId,
            context_type: type,
            current_context: newValue,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,chat_id,character_id,context_type'
          })
        );
      } else {
        console.log(`⏭️ Skipping ${type} context update - no changes detected`);
      }
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

// Message utilities
async function createPlaceholderMessage(
  supabase: any,
  chatId: string,
  messageOrderIndex: number
) {
  // Use crypto.randomUUID() to generate a proper UUID for the placeholder
  const placeholderId = crypto.randomUUID();
  
  const { data: placeholder, error } = await supabase
    .from('messages')
    .insert({
      id: placeholderId,
      chat_id: chatId,
      author_id: null,
      content: '',
      is_ai_message: true,
      is_placeholder: true,
      message_order: messageOrderIndex,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating placeholder message:', error);
    return null;
  }

  return placeholder;
}

async function saveCharacterMessage(
  supabase: any,
  supabaseAdmin: any,
  userId: string,
  chatId: string,
  message: string,
  currentContext?: any,
  placeholderId?: string,
  messageOrderIndex?: number
) {
  if (placeholderId) {
    // Update existing placeholder using admin client (placeholders have author_id: null)
    const { data: messageData, error: messageError } = await supabaseAdmin
      .from('messages')
      .update({
        content: message,
        is_placeholder: false,
        current_context: currentContext,
        updated_at: new Date().toISOString()
      })
      .eq('id', placeholderId)
      .select()
      .single();

    if (messageError) {
      console.error('Error updating placeholder message:', messageError);
      throw new Error('Failed to update character message');
    }

    return messageData;
  } else {
    // Create new message (fallback)
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        author_id: null,  // AI messages should have NULL author_id
        content: message,
        is_ai_message: true,
        current_context: currentContext,
        message_order: messageOrderIndex || 1,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error saving character message:', messageError);
      throw new Error('Failed to save character message');
    }

    return messageData;
  }
}

async function updateChatLastActivity(
  supabase: any,
  chatId: string,
  characterId: string
) {
  await supabase
    .from('chats')
    .update({ 
      last_message_at: new Date().toISOString() 
    })
    .eq('id', chatId);

  // Update character last_activity
  await supabase
    .from('characters')
    .update({ 
      last_activity: new Date().toISOString() 
    })
    .eq('id', characterId);
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('📋 CORS preflight request received');
    return createCorsResponse();
  }

  // Add a simple test route for debugging
  if (req.url.includes('test')) {
    console.log('🧪 Test endpoint reached');
    return createCorsResponse({ message: 'Function is working', timestamp: new Date().toISOString() });
  }

  const startTime = Date.now();
  console.log('🚀 Chat streaming function called - Enhanced Debug Version');
  console.log('📝 Request method:', req.method);
  console.log('📝 Request URL:', req.url);
  console.log('📝 Headers:', Object.fromEntries(req.headers.entries()));

  try {
    // Authenticate user with enhanced debugging
    console.log('🔐 Starting user authentication...');
    let user, supabase, supabaseAdmin;
    
    try {
      const authResult = await authenticateUser(req);
      user = authResult.user;
      supabase = authResult.supabase;
      supabaseAdmin = authResult.supabaseAdmin;
      console.log('👤 User authenticated successfully:', user.id);
    } catch (authError) {
      console.error('❌ Authentication failed with error:', authError);
      console.error('❌ Auth error details:', {
        message: authError.message,
        stack: authError.stack
      });
      return createErrorResponse(`Authentication failed: ${authError.message}`, 401);
    }

    // Parse the incoming request body
    console.log('📥 Parsing request body...');
    const requestBody = await req.json();
    console.log('📥 Request body parsed:', Object.keys(requestBody));
    
    const { chatId, message, characterId, addonSettings, selectedPersonaId } = requestBody;
    
    if (!chatId || !message || !characterId) {
      console.error('❌ Missing required fields:', { chatId: !!chatId, message: !!message, characterId: !!characterId });
      return createErrorResponse('Missing required fields', 400);
    }

    console.log('✅ Required fields validated:', { chatId, characterId, messageLength: message.length });

    // Get next message order index
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('message_order')
      .eq('chat_id', chatId)
      .order('message_order', { ascending: false })
      .limit(1)
      .single();

    const nextUserMessageOrder = (lastMessage?.message_order || 0) + 1;

    // Save user message first
    const userMessage = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        author_id: user.id,
        content: message,
        is_ai_message: false,
        message_order: nextUserMessageOrder,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (userMessage.error) {
      console.error('Failed to save user message:', userMessage.error);
      return createErrorResponse('Failed to save user message', 500);
    }

    const aiMessageOrder = nextUserMessageOrder + 1;

    // Create AI placeholder message that we'll update during streaming
    const placeholder = await createPlaceholderMessage(supabase, chatId, aiMessageOrder);
    if (!placeholder) {
      console.error('❌ Failed to create placeholder message');
      return createErrorResponse('Failed to create placeholder message', 500);
    }

    console.log('✅ Created messages:', {
      userMessageId: userMessage.data.id,
      placeholderId: placeholder.id,
      aiMessageOrder
    });

    // Get OpenRouter API key
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      console.error('OpenRouter API key not configured');
      return createErrorResponse('OpenRouter API key not configured', 500);
    }

    // Fetch character data and conversation history in parallel
    const [characterResult, messageHistoryResult, userProfileResult, userSubscriptionResult] = await Promise.all([
      supabaseAdmin.from('character_definitions').select('personality_summary, description, scenario, greeting').eq('character_id', characterId).single(),
      supabase.from('messages').select('content, is_ai_message, created_at, message_order').eq('chat_id', chatId).order('message_order', { ascending: true }).limit(20),
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      supabase.from('subscriptions').select('plan_id, status, current_period_end').eq('user_id', user.id).eq('status', 'active').gt('current_period_end', new Date().toISOString()).maybeSingle()
    ]);

    if (characterResult.error) {
      console.error('Character definition error:', characterResult.error);
      return createErrorResponse('Character definition not found', 404);
    }

    const character = characterResult.data;
    const messageHistory = messageHistoryResult.data || [];
    const userProfile = userProfileResult.data;
    const userSubscription = userSubscriptionResult.data;

    if (messageHistoryResult.error) {
      console.error('Failed to fetch conversation history:', messageHistoryResult.error);
    }

    // Determine user's model tier - Default to Guest Pass if no active subscription
    let selectedModel = 'openai/gpt-4o-mini'; // Guest Pass - Fast & Fun
    if (userSubscription) {
      // Get plan details
      const { data: planData, error: planError } = await supabaseAdmin.from('plans').select('name').eq('id', userSubscription.plan_id).single();
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

    // Define base model costs per plan
    const PLAN_MODEL_COSTS = {
      'Guest Pass': { model: 'openai/gpt-4o-mini', cost: 10 },
      'True Fan': { model: 'gryphe/mythomax-l2-13b', cost: 4 },
      'The Whale': { model: 'nousresearch/nous-hermes-2-mixtral-8x7b-dpo', cost: 7 }
    };

    // Get user's current plan and calculate credit costs
    let userPlan = 'Guest Pass'; // Default
    if (userSubscription) {
      const { data: planData, error: planError } = await supabaseAdmin.from('plans').select('name').eq('id', userSubscription.plan_id).single();
      if (planData) {
        userPlan = planData.name;
      }
    }

    // Calculate base model cost
    const planCostInfo = PLAN_MODEL_COSTS[userPlan];
    if (!planCostInfo) {
      return createErrorResponse('Invalid plan configuration', 500);
    }

    const baseCost = planCostInfo.cost;

    // Calculate addon percentage increase
    let addonPercentage = 0;
    if (addonSettings) {
      if (addonSettings.dynamicWorldInfo) addonPercentage += 10;
      if (addonSettings.moodTracking) addonPercentage += 5;
      if (addonSettings.clothingInventory) addonPercentage += 5;
      if (addonSettings.locationTracking) addonPercentage += 5;
      if (addonSettings.timeAndWeather) addonPercentage += 5;
      if (addonSettings.relationshipStatus) addonPercentage += 5;
      if (addonSettings.characterPosition) addonPercentage += 5;
      if (addonSettings.chainOfThought) addonPercentage += 30;
      if (addonSettings.fewShotExamples) addonPercentage += 7;
    }

    const totalCost = Math.ceil(baseCost * (1 + addonPercentage / 100));
    console.log(`💰 Credit calculation: Base(${baseCost}) + ${addonPercentage}% addon increase = Total(${totalCost})`);

    // Check and consume credits before proceeding
    const { data: creditCheckResult, error: creditError } = await supabaseAdmin.rpc('consume_credits', {
      user_id_param: user.id,
      credits_to_consume: totalCost
    });

    if (creditError) {
      console.error('Credit consumption error:', creditError);
      return createErrorResponse('Failed to process credits', 500);
    }

    if (!creditCheckResult) {
      console.log('❌ Insufficient credits for user:', user.id);
      return createErrorResponse(`Insufficient credits. Required: ${totalCost} credits (${baseCost} base + ${addonPercentage}% addon increase)`, 402);
    }

    console.log(`✅ Credits consumed successfully: ${totalCost} credits deducted`);

    // Fetch persona data if provided
    let selectedPersona = null;
    if (selectedPersonaId) {
      const { data: persona } = await supabase.from('personas').select('name, bio').eq('id', selectedPersonaId).eq('user_id', user.id).single();
      if (persona) {
        selectedPersona = persona;
      }
    }

    // Create template context
    const templateContext: TemplateContext = {
      userName: selectedPersona?.name || userProfile?.username || 'User',
      charName: character.personality_summary?.split(' ')[0] || 'Character'
    };

    // Get current context from database
    const { data: currentContextData } = await supabase
      .from('user_chat_context')
      .select('context_type, current_context')
      .eq('user_id', user.id)
      .eq('chat_id', chatId)
      .eq('character_id', characterId);

    // Build current context object
    const currentContext: any = {};
    if (currentContextData) {
      currentContextData.forEach(ctx => {
        if (ctx.current_context && ctx.current_context !== 'No context') {
          const contextKey = ctx.context_type === 'mood' ? 'moodTracking' :
                           ctx.context_type === 'clothing' ? 'clothingInventory' :
                           ctx.context_type === 'location' ? 'locationTracking' :
                           ctx.context_type === 'time_weather' ? 'timeAndWeather' :
                           ctx.context_type === 'relationship' ? 'relationshipStatus' :
                           ctx.context_type === 'character_position' ? 'characterPosition' : null;
          if (contextKey) {
            currentContext[contextKey] = ctx.current_context;
          }
        }
      });
    }

    // If no context exists and addons are enabled, extract initial context
    const hasExistingContext = Object.keys(currentContext).length > 0;
    if (!hasExistingContext && addonSettings && Object.values(addonSettings).some(Boolean)) {
      console.log('🔄 No existing context found, extracting initial context...');
      const initialContext = await extractInitialContext(
        character,
        addonSettings,
        openRouterKey,
        (content: string) => replaceTemplates(content, templateContext)
      );
      
      if (initialContext) {
        // Save initial context to database
        await saveContextUpdates(initialContext, addonSettings, user.id, chatId, characterId, supabaseAdmin);
        
        // Update current context object
        Object.entries(initialContext).forEach(([field, value]) => {
          if (value && value !== 'No context') {
            const contextKey = field === 'mood' ? 'moodTracking' :
                             field === 'clothing' ? 'clothingInventory' :
                             field === 'location' ? 'locationTracking' :
                             field === 'time_weather' ? 'timeAndWeather' :
                             field === 'relationship' ? 'relationshipStatus' :
                             field === 'character_position' ? 'characterPosition' : null;
            if (contextKey) {
              currentContext[contextKey] = value;
            }
          }
        });
      }
    }

    console.log('📊 Current context for prompt:', currentContext);

    // Build conversation context
    const conversationContext = messageHistory?.map((msg: any) => ({
      role: msg.is_ai_message ? 'assistant' : 'user',
      content: msg.content
    })) || [];

    // Build enhanced prompt using utility with current context
    const systemPrompt = buildSystemPrompt(character, addonSettings, templateContext, currentContext);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationContext,
      { role: 'user', content: message }
    ];

    console.log('🎯 Streaming AI response for:', characterId);

    // Make API call to OpenRouter
    const cleanMessageResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-Streaming'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    // Enhanced error handling
    if (!cleanMessageResponse.ok) {
      console.error('❌ OpenRouter API Error Status:', cleanMessageResponse.status);
      const errorMessage = `OpenRouter API failed (Status: ${cleanMessageResponse.status}). Model: ${selectedModel}. Plan: ${userPlan}. Please try again.`;
      
      // Return streaming error response
      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"${errorMessage}"}}]}\n\n`));
          controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
          controller.close();
        }
      });

      return new Response(errorStream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // Remove the old background context extraction
    // We'll do this synchronously after the AI response is complete

    // Set up Server-Sent Events response with improved streaming
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = cleanMessageResponse.body?.getReader();
          if (!reader) throw new Error('No reader available');

          let fullResponse = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode chunk and add to buffer
            buffer += new TextDecoder().decode(value, { stream: true });

            // Process complete lines from buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim() === '') continue;

              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  // Save the final message with context
                  const finalMessage = fullResponse.trim();
                  if (finalMessage) {
                    console.log('🔄 Extracting context from AI response before saving message...');
                    
                    // Extract context from the AI response FIRST
                    const extractedContext = await extractContextFromResponse(
                      character,
                      conversationContext,
                      message,
                      finalMessage,
                      addonSettings,
                      openRouterKey,
                      (content: string) => replaceTemplates(content, templateContext),
                      supabase,
                      user.id,
                      chatId,
                      characterId
                    );

                    // Update context if extraction was successful
                    if (extractedContext && addonSettings) {
                      console.log('💾 Updating context with extracted data...');
                      await saveContextUpdates(extractedContext, addonSettings, user.id, chatId, characterId, supabaseAdmin);
                    }

                    // NOW get the updated context from the database for the message
                    const { data: currentContextData } = await supabase
                      .from('user_chat_context')
                      .select('context_type, current_context')
                      .eq('user_id', user.id)
                      .eq('chat_id', chatId)
                      .eq('character_id', characterId);

                    // Build current context object for the message using BOTH old and new context
                    const messageContext = {
                      moodTracking: 'No context',
                      clothingInventory: 'No context',
                      locationTracking: 'No context',
                      timeAndWeather: 'No context',
                      relationshipStatus: 'No context',
                      characterPosition: 'No context'
                    };

                    // Map database context to frontend format
                    if (currentContextData) {
                      currentContextData.forEach(ctx => {
                        if (ctx.current_context && ctx.current_context !== 'No context') {
                          const contextKey = ctx.context_type === 'mood' ? 'moodTracking' :
                                           ctx.context_type === 'clothing' ? 'clothingInventory' :
                                           ctx.context_type === 'location' ? 'locationTracking' :
                                           ctx.context_type === 'time_weather' ? 'timeAndWeather' :
                                           ctx.context_type === 'relationship' ? 'relationshipStatus' :
                                           ctx.context_type === 'character_position' ? 'characterPosition' : null;
                          if (contextKey) {
                            messageContext[contextKey] = ctx.current_context;
                          }
                        }
                      });
                    }

                    // If we extracted new context, immediately update the message context
                    if (extractedContext) {
                      console.log('🔄 Applying extracted context to message context:', extractedContext);
                      // Map extracted context fields to message context format
                      if (extractedContext.mood && extractedContext.mood !== 'No context' && addonSettings.moodTracking) {
                        messageContext.moodTracking = extractedContext.mood;
                      }
                      if (extractedContext.clothing && extractedContext.clothing !== 'No context' && addonSettings.clothingInventory) {
                        messageContext.clothingInventory = extractedContext.clothing;
                      }
                      if (extractedContext.location && extractedContext.location !== 'No context' && addonSettings.locationTracking) {
                        messageContext.locationTracking = extractedContext.location;
                      }
                      if (extractedContext.time_weather && extractedContext.time_weather !== 'No context' && addonSettings.timeAndWeather) {
                        messageContext.timeAndWeather = extractedContext.time_weather;
                      }
                      if (extractedContext.relationship && extractedContext.relationship !== 'No context' && addonSettings.relationshipStatus) {
                        messageContext.relationshipStatus = extractedContext.relationship;
                      }
                      if (extractedContext.character_position && extractedContext.character_position !== 'No context' && addonSettings.characterPosition) {
                        messageContext.characterPosition = extractedContext.character_position;
                      }
                    }

                    console.log('💾 Saving message with COMPLETE updated context:', messageContext);
                    await saveCharacterMessage(supabase, supabaseAdmin, user.id, chatId, finalMessage, messageContext, placeholder.id, aiMessageOrder);
                    await updateChatLastActivity(supabase, chatId, characterId);
                  }

                  // Send completion signal
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    const content = parsed.choices[0].delta.content;
                    fullResponse += content;
                    
                    // Update placeholder in database with current progress
                    await supabaseAdmin
                      .from('messages')
                      .update({
                        content: fullResponse,
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', placeholder.id);
                    
                    // Forward the chunk to frontend for immediate display
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                  }
                } catch (e) {
                  console.error('Error parsing chunk:', e);
                }
              }
            }
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            console.warn('Incomplete data in buffer:', buffer);
          }
        } catch (error) {
          console.error('❌ Streaming error:', error);
          // Send error message
          const errorChunk = {
            choices: [{ delta: { content: `Error: ${error.message}. Please try again.` } }]
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      }
    });

    const endTime = Date.now();
    console.log(`⚡ Streaming initiated in ${endTime - startTime}ms`);

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('❌ Chat streaming error:', error);
    return createErrorResponse(error.message, 500);
  }
});
