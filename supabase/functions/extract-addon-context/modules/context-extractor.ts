/**
 * Context extraction utilities for addon features
 * Uses a separate lightweight model (mistralai/mistral-small-3.2-24b-instruct) specifically for context analysis
 * This keeps context extraction separate from message generation models
 */
// Allow Deno global in TS type-checking
declare const Deno: any;

import { dbToUi, type DbContext } from '../../_shared/context-mapper.ts';

export async function extractInitialContext(character, addonSettings, openRouterKey, replaceTemplatesFn) {
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
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const headers = {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
      'X-Title': 'AnimaChat-InitialContext'
    } as const;

    const body = {
      model: 'mistralai/mistral-small-3.2-24b-instruct',
      messages: [
        { role: 'user', content: contextPrompt }
      ],
      temperature: 0,
      top_p: 0.1,
      max_tokens: 250
    };

    const contextResponse = await fetch(url, {
      method: 'POST',
      headers: headers as any,
      body: JSON.stringify(body)
    });
    if (contextResponse.ok) {
      const contextData = await contextResponse.json();
      const contextStr = contextData.choices?.[0]?.message?.content || '{}';
      console.log('📝 Initial context extraction response:', contextStr);
      const cleanedContextStr = contextStr.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      let parsed: any = null;
      try {
        parsed = JSON.parse(cleanedContextStr);
      } catch (parseError) {
        console.error('Failed to parse initial context JSON:', parseError);
        return null;
      }

      const allowedKeys = ['mood','location','clothing','time_weather','relationship','character_position'];
      if (!parsed || typeof parsed !== 'object') return null;
      // Normalize to allowed keys and enforce defaults/limits
      const result: Record<string, string> = {};
      for (const k of allowedKeys) {
        const v = parsed[k];
        if (typeof v === 'string' && v.trim()) result[k] = v.trim().slice(0, 120);
        else result[k] = 'No context';
      }
      console.log('🔍 Parsed initial context:', result);
      return result;
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
    const tryParse = (raw: string) => {
      const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        return null;
      }
    };

    const validateSchema = (obj: any, allowedKeys: string[]) => {
      if (!obj || typeof obj !== 'object') return false;
      // Ensure only allowed keys and string values
      for (const key of Object.keys(obj)) {
        if (!allowedKeys.includes(key)) return false;
        if (obj[key] !== null && typeof obj[key] !== 'string') return false;
        if (typeof obj[key] === 'string' && obj[key].length > 120) obj[key] = obj[key].slice(0, 120);
      }
      return true;
    };

    const allowedKeys = Object.keys(contextFields);

    const buildBody = (messagesArr: any[]) => ({
      model: 'mistralai/mistral-small-3.2-24b-instruct',
      messages: messagesArr,
      temperature: 0,
      top_p: 0.1,
      max_tokens: 250
    });

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const headers = {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
      'X-Title': 'AnimaChat-Context'
    };

    const firstReq = await fetch(url, { method: 'POST', headers, body: JSON.stringify(buildBody([{ role: 'user', content: contextPrompt }])) });
    if (!firstReq.ok) throw new Error(`OpenRouter error: ${firstReq.status}`);
    const firstJson = await firstReq.json();
    const firstText = firstJson.choices?.[0]?.message?.content || '{}';
    console.log('📝 Raw context extraction response:', firstText);

    let parsed = tryParse(firstText);
    if (!parsed || !validateSchema(parsed, allowedKeys)) {
      console.warn('⚠️ Context JSON invalid; retrying with corrective system message');
      const fixPrompt = `Return ONLY a valid minified JSON object for these keys: ${allowedKeys.join(', ')}. No prose, no markdown fences.`;
      const retryReq = await fetch(url, { method: 'POST', headers, body: JSON.stringify(buildBody([
        { role: 'system', content: fixPrompt },
        { role: 'user', content: contextPrompt }
      ])) });
      if (retryReq.ok) {
        const retryJson = await retryReq.json();
        const retryText = retryJson.choices?.[0]?.message?.content || '{}';
        parsed = tryParse(retryText);
      }
    }

    if (!parsed) return null;

    // Ensure we have values for all enabled fields
    for (const key of allowedKeys) {
      const v = parsed[key];
      if (v == null || v === '') parsed[key] = 'No context';
      else if (typeof v === 'string') parsed[key] = v.trim().slice(0, 120);
    }
    console.log('🔍 Parsed context:', parsed);
    return parsed;
  } catch (error) {
    console.error('Context extraction error:', error);
  }
  return null;
}
export async function saveContextUpdates(extractedContext, addonSettings, userId, chatId, characterId, supabase) {
  if (!extractedContext || !addonSettings) return;
  const contextMappings = [
    { setting: 'moodTracking', field: 'mood', type: 'mood' },
    { setting: 'clothingInventory', field: 'clothing', type: 'clothing' },
    { setting: 'locationTracking', field: 'location', type: 'location' },
    { setting: 'timeAndWeather', field: 'time_weather', type: 'time_weather' },
    { setting: 'relationshipStatus', field: 'relationship', type: 'relationship' },
    { setting: 'characterPosition', field: 'character_position', type: 'character_position' },
    { setting: 'timeAwareness', field: 'conversation_tone', type: 'conversation_tone' },
    { setting: 'timeAwareness', field: 'urgency_level', type: 'urgency_level' }
  ];

  // Build the context object for the chat_context table
  const contextData: DbContext = {
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
        (contextData as any)[field] = newValue;
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
          // Build message context format using shared mapper
          const messageContext = dbToUi(contextData);
          
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
