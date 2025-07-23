/**
 * Context extraction utilities for addon features
 * Uses a separate lightweight model (mistralai/mistral-7b-instruct) specifically for context analysis
 * This keeps context extraction separate from message generation models
 */ export async function extractInitialContext(character, addonSettings, openRouterKey, replaceTemplatesFn) {
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
        const cleanedContextStr = contextStr.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
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
export async function extractContextFromResponse(character, conversationContext, message, aiResponse, addonSettings, openRouterKey, replaceTemplatesFn, supabase, userId, chatId, characterId) {
  console.log('🔍 CONTEXT EXTRACTION DEBUG: Function called', {
    timestamp: new Date().toISOString(),
    chatId,
    characterId,
    callStack: new Error().stack?.split('\n').slice(0, 5)
  });
  
  if (!addonSettings || !Object.values(addonSettings).some(Boolean)) {
    console.log('No addons enabled - skipping context extraction');
    return null;
  }
  // Build context fields based on enabled addons only
  const enabledFields = [];
  const contextFields = {};
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

  // Add time awareness context extraction
  if (addonSettings.timeAwareness) {
    enabledFields.push('"conversation_tone": "current emotional tone (neutral/tense/romantic/playful/serious/angry/sad/excited)"');
    enabledFields.push('"urgency_level": "conversation urgency (low/medium/high)"');
    contextFields.conversation_tone = 'conversation_tone';
    contextFields.urgency_level = 'urgency_level';
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
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-Context'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct',
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
        const cleanedContextStr = contextStr.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        const parsedContext = JSON.parse(cleanedContextStr);
        console.log('🔍 Parsed context:', parsedContext);
        // Ensure we have values for all enabled fields (but don't contaminate with old context)
        for (const [fieldKey, fieldType] of Object.entries(contextFields)){
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
export async function saveContextUpdates(extractedContext, addonSettings, userId, chatId, characterId, supabase) {
  if (!extractedContext || !addonSettings) return;
  const contextMappings = [
    {
      setting: 'moodTracking',
      field: 'mood',
      type: 'mood'
    },
    {
      setting: 'clothingInventory',
      field: 'clothing',
      type: 'clothing'
    },
    {
      setting: 'locationTracking',
      field: 'location',
      type: 'location'
    },
    {
      setting: 'timeAndWeather',
      field: 'time_weather',
      type: 'time_weather'
    },
    {
      setting: 'relationshipStatus',
      field: 'relationship',
      type: 'relationship'
    },
    {
      setting: 'characterPosition',
      field: 'character_position',
      type: 'character_position'
    },
    {
      setting: 'timeAwareness',
      field: 'conversation_tone',
      type: 'conversation_tone'
    },
    {
      setting: 'timeAwareness',
      field: 'urgency_level',
      type: 'urgency_level'
    }
  ];

  // Build the context object for the chat_context table
  const contextData = {
    mood: null,
    clothing: null,
    location: null,
    relationship: null,
    time_weather: null,
    character_position: null,
    conversation_tone: null,
    urgency_level: null
  };

  let hasUpdates = false;

  for (const { setting, field } of contextMappings) {
    if (addonSettings[setting] && extractedContext[field]) {
      const newValue = extractedContext[field];
      // Only update if we got a meaningful value (not "No context")
      if (newValue !== 'No context') {
        const contextKey = field === 'time_weather' ? 'time_weather' : 
                          field === 'character_position' ? 'character_position' :
                          field === 'conversation_tone' ? 'conversation_tone' :
                          field === 'urgency_level' ? 'urgency_level' :
                          field;
        contextData[contextKey] = newValue;
        hasUpdates = true;
        console.log(`💾 Setting ${field} context:`, newValue);
      } else {
        console.log(`⏭️ Skipping ${field} context update - no changes detected`);
      }
    }
  }

  if (hasUpdates) {
    try {
      console.log('💾 Updating chat_context table with:', contextData);
      
      const { error } = await supabase
        .from('chat_context')
        .upsert({
          user_id: userId,
          chat_id: chatId,
          character_id: characterId,
          current_context: contextData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'chat_id'
        });

      if (error) {
        console.error('Context update error:', error);
      } else {
        console.log('✅ Context saved to chat_context table successfully');
        
        // ALSO update the latest AI message with the new context for immediate UI update
        console.log('🔄 Updating latest AI message with extracted context...');
        try {
          // Build message context format (different from chat_context format)
          const messageContext = {
            moodTracking: extractedContext.mood || 'No context',
            clothingInventory: extractedContext.clothing || 'No context',
            locationTracking: extractedContext.location || 'No context',
            timeAndWeather: extractedContext.time_weather || 'No context',
            relationshipStatus: extractedContext.relationship || 'No context',
            characterPosition: extractedContext.character_position || 'No context',
            conversationTone: extractedContext.conversation_tone || 'No context',
            urgencyLevel: extractedContext.urgency_level || 'No context'
          };
          
          // Find the latest AI message in this chat
          const { data: latestMessage, error: messageError } = await supabase
            .from('messages')
            .select('id')
            .eq('chat_id', chatId)
            .eq('is_ai_message', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (messageError) {
            console.error('❌ Failed to find latest AI message:', messageError);
          } else if (latestMessage) {
            // Update the latest AI message with the extracted context
            const { error: updateError } = await supabase
              .from('messages')
              .update({ 
                current_context: messageContext,
                updated_at: new Date().toISOString()
              })
              .eq('id', latestMessage.id);
            
            if (updateError) {
              console.error('❌ Failed to update latest AI message with context:', updateError);
            } else {
              console.log('✅ Latest AI message updated with context - UI should update immediately');
            }
          }
        } catch (msgUpdateError) {
          console.error('❌ Error updating latest AI message:', msgUpdateError);
        }
      }
    } catch (error) {
      console.error('Context update error:', error);
    }
  }
}
