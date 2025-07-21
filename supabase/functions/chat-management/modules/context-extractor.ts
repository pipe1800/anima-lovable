import type { 
  Character, 
  AddonSettings, 
  TemplateContext, 
  ContextData, 
  SupabaseClient 
} from '../types/streaming-interfaces.ts';

/**
 * Context extraction utilities for addon features
 * Uses a separate lightweight model (mistralai/mistral-7b-instruct) specifically for context analysis
 * This keeps context extraction separate from message generation models
 */

/**
 * Extract consolidated context from multiple characters and world infos
 * This is the correct function for chat-management extract-context operation
 */
export async function extractInitialContext(
  charactersData: Array<{
    id: string;
    name: string;
    description?: string;
    context?: string;
    scenario?: string;
    personality?: string;
    first_message?: string;
    message_example?: string;
    example_conversations?: string;
  }>,
  worldInfos: Array<{
    id: string;
    name: string;
    content: string;
    keywords: string[];
  }>,
  chatId: string,
  maxTokens: number = 4000
): Promise<{ context: string; characterCount: number; worldInfoCount: number; totalTokens: number }> {
  console.log('🧠 Extracting initial context for multiple characters and world infos');
  console.log(`Characters: ${charactersData.length}, World Infos: ${worldInfos.length}, Max Tokens: ${maxTokens}`);

  let consolidatedContext = '';
  let tokenCount = 0;

  // Process characters
  if (charactersData && charactersData.length > 0) {
    consolidatedContext += '[CHARACTERS]\n';
    
    for (const character of charactersData) {
      const characterContext = `
Name: ${character.name}
${character.description ? `Description: ${character.description}` : ''}
${character.scenario ? `Scenario: ${character.scenario}` : ''}
${character.personality ? `Personality: ${character.personality}` : ''}
${character.context ? `Context: ${character.context}` : ''}
${character.first_message ? `First Message: ${character.first_message}` : ''}
${character.example_conversations ? `Example Conversations: ${character.example_conversations}` : ''}
`;
      
      // Estimate token count (rough approximation: 1 token ≈ 4 characters)
      const characterTokens = Math.ceil(characterContext.length / 4);
      
      if (tokenCount + characterTokens <= maxTokens) {
        consolidatedContext += characterContext + '\n';
        tokenCount += characterTokens;
      } else {
        console.log(`⏭️ Skipping character ${character.name} - would exceed token limit`);
      }
    }
    
    consolidatedContext += '[/CHARACTERS]\n\n';
  }

  // Process world infos
  if (worldInfos && worldInfos.length > 0) {
    consolidatedContext += '[WORLD INFORMATION]\n';
    
    for (const worldInfo of worldInfos) {
      const worldInfoContext = `
Name: ${worldInfo.name}
Keywords: ${worldInfo.keywords.join(', ')}
Content: ${worldInfo.content}
`;
      
      // Estimate token count
      const worldInfoTokens = Math.ceil(worldInfoContext.length / 4);
      
      if (tokenCount + worldInfoTokens <= maxTokens) {
        consolidatedContext += worldInfoContext + '\n';
        tokenCount += worldInfoTokens;
      } else {
        console.log(`⏭️ Skipping world info ${worldInfo.name} - would exceed token limit`);
      }
    }
    
    consolidatedContext += '[/WORLD INFORMATION]\n\n';
  }

  // Add metadata
  consolidatedContext += `[METADATA]
Chat ID: ${chatId}
Total Characters: ${charactersData.length}
Total World Infos: ${worldInfos.length}
Estimated Tokens: ${tokenCount}
Generated At: ${new Date().toISOString()}
[/METADATA]`;

  console.log(`✅ Context extracted - ${tokenCount} tokens, ${charactersData.length} characters, ${worldInfos.length} world infos`);

  return {
    context: consolidatedContext,
    characterCount: charactersData.length,
    worldInfoCount: worldInfos.length,
    totalTokens: tokenCount
  };
}

/**
 * AI-powered context extraction for individual character (for addon features)
 * This is the original function for chat-stream style context extraction
 */
export async function extractCharacterContext(
  character: Character,
  addonSettings: AddonSettings,
  openRouterKey: string,
  replaceTemplatesFn: (content: string) => string
): Promise<ContextData | null> {
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
        'HTTP-Referer': globalThis.Deno?.env?.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-InitialContext'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct', // Dedicated context extraction model
        messages: [
          {
            role: 'user',
            content: contextPrompt
          }
        ],
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

export async function extractContextFromResponse(
  character: Character,
  conversationContext: any[],
  message: string,
  aiResponse: string,
  addonSettings: AddonSettings,
  openRouterKey: string,
  replaceTemplatesFn: (content: string) => string,
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
  characterId: string
): Promise<ContextData | null> {
  if (!addonSettings || !Object.values(addonSettings).some(Boolean)) {
    console.log('No addons enabled - skipping context extraction');
    return null;
  }

  // Build context fields based on enabled addons only
  const enabledFields: string[] = [];
  const contextFields: Record<string, string> = {};

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
        'HTTP-Referer': globalThis.Deno?.env?.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-Context'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct', // Same dedicated context model
        messages: [
          {
            role: 'user',
            content: contextPrompt
          }
        ],
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

export async function saveContextUpdates(
  extractedContext: ContextData,
  addonSettings: AddonSettings,
  userId: string,
  chatId: string,
  characterId: string,
  supabase: SupabaseClient
): Promise<void> {
  if (!extractedContext || !addonSettings) return;

  const contextMappings = [
    { setting: 'moodTracking', field: 'mood', type: 'mood' },
    { setting: 'clothingInventory', field: 'clothing', type: 'clothing' },
    { setting: 'locationTracking', field: 'location', type: 'location' },
    { setting: 'timeAndWeather', field: 'time_weather', type: 'time_weather' },
    { setting: 'relationshipStatus', field: 'relationship', type: 'relationship' },
    { setting: 'characterPosition', field: 'character_position', type: 'character_position' }
  ];

  const contextUpdatePromises: Promise<any>[] = [];

  for (const { setting, field, type } of contextMappings) {
    if (addonSettings[setting as keyof AddonSettings] && extractedContext[field as keyof ContextData]) {
      const newValue = extractedContext[field as keyof ContextData];
      
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
      const failures = results.filter((r) => r.status === 'rejected');
      
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