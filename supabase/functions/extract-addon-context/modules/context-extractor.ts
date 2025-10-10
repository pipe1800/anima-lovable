/**
 * Context extraction utilities for addon features
 * Uses a separate lightweight model (mistralai/mistral-small-3.2-24b-instruct) specifically for context analysis
 * This keeps context extraction separate from message generation models
 */ // Allow Deno global in TS type-checking
import { dbToUi } from '../../_shared/context-mapper.ts';
// Runtime helper to safely pluck OpenRouter choices
function extractChoiceContent(payload) {
  if (!payload || typeof payload !== 'object') return '{}';
  const choices = payload.choices;
  if (!Array.isArray(choices) || !choices[0]) return '{}';
  const content = choices[0]?.message?.content;
  return typeof content === 'string' ? content : '{}';
}
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
    };
    const body = {
      model: 'mistralai/mistral-small-3.2-24b-instruct',
      messages: [
        {
          role: 'user',
          content: contextPrompt
        }
      ],
      temperature: 0,
      top_p: 0.1,
      max_tokens: 250
    };
    const contextResponse = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    if (contextResponse.ok) {
      const contextData = await contextResponse.json();
      const contextStr = extractChoiceContent(contextData);
      console.log('📝 Initial context extraction response:', contextStr);
      const cleanedContextStr = contextStr.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      let parsed = null;
      try {
        parsed = JSON.parse(cleanedContextStr);
      } catch (parseError) {
        console.error('Failed to parse initial context JSON:', parseError);
        return null;
      }
      const allowedKeys = [
        'mood',
        'location',
        'clothing',
        'time_weather',
        'character_position'
      ];
      if (!parsed || typeof parsed !== 'object') return null;
      // Normalize to allowed keys and enforce defaults/limits
      const result = {};
      for (const k of allowedKeys){
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
export async function extractContextFromResponse(character, conversationContext, message, aiResponse, addonSettings, openRouterKey, replaceTemplatesFn, supabase, userId, chatId, characterId, previousContext) {
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
  const godMode = !!addonSettings.godMode;
  const prior = previousContext || {};
  const reasonKeys = Object.keys(contextFields);
  const noPriorContext = !prior || Object.values(prior).every((v)=>!v || v === 'No context');
  const cardSnippet = noPriorContext ? `\nCHARACTER CARD SEED (do not hallucinate beyond this; only use to disambiguate): ${[
    character?.personality_summary || '',
    character?.description || '',
    typeof character?.scenario === 'string' ? character?.scenario : character?.scenario ? JSON.stringify(character.scenario) : '',
    character?.greeting || ''
  ].join(' ').replace(/\s+/g, ' ').trim().slice(0, 800)}\n` : '';
  const contextPrompt = `You are extracting UPDATED context fields from a single user → AI exchange.${cardSnippet}

PRIOR CONTEXT (may be partial): ${JSON.stringify(prior).slice(0, 400)}

USER: "${message}"
CHARACTER: "${aiResponse}"

For each enabled field output an object: { "value": string, "changed": boolean, "reason": one_of[explicit_user,user_request,environment_shift,narrative_followup,ai_spontaneous,no_change] }.

REASONS:
- explicit_user: user directly states new state ("you're wearing", "you are now at")
- user_request: user asks to change ("put on", "move to") AND change executed in reply
- environment_shift: new setting/conditions make prior state implausible and reply reflects adaptation
- narrative_followup: continuation of a previously started multi-step change (reference prior value)
- ai_spontaneous: model changed without any valid trigger above
- no_change: field not referenced / no justification to alter

RULES:
- If no evidence of change: keep previous value (or "No context" if none) with changed=false reason=no_change.
- Keep value ≤ 8 words. No concatenations.
- LOCATION detection cues (ANY of these -> candidate): prepositions ("at/in/inside/within/near/by/on the"), movement verbs ("go to", "walks to", "heads to", "arrives at", "enters", "steps into", "leaves", "exits"), explicit setting phrases ("in the classroom", "at the beach"). Prefer the MOST SPECIFIC latest phrase. Ignore metaphorical phrases.
- If multiple locations appear, choose the final one associated with arrival / presence.
- CHARACTER POSITION cues: posture or stance verbs/adjectives ("sitting", "standing", "lying", "reclining", "crouching", "kneeling", "running", "walking", "pacing", "folds her arms", "cross-legged"). Summarize posture + simple action if present (e.g. "sitting, leaning forward").
- Clothing/location require explicit verbs or arrival/transition indicators to change.
- Mood changes only with emotional stimulus or explicit descriptor consistent with character card.
- Safe mode (godMode=false): reject unsupported user assertions lacking change verbs if they contradict prior; if model still changed mark ai_spontaneous and revert.
- God mode: any explicit user assertion overrides (explicit_user).
- If model invented change w/out trigger: mark ai_spontaneous and revert to prior.

Return JSON ONLY with top-level keys: ${reasonKeys.join(', ')} each mapping to its object.`;
  try {
    const tryParse = (raw)=>{
      const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        return null;
      }
    };
    const validateSchema = (obj, allowedKeys)=>{
      if (!obj || typeof obj !== 'object') return false;
      // Ensure only allowed keys and string values
      for (const key of Object.keys(obj)){
        if (!allowedKeys.includes(key)) return false;
        if (obj[key] !== null && typeof obj[key] !== 'string') return false;
        if (typeof obj[key] === 'string' && obj[key].length > 120) obj[key] = obj[key].slice(0, 120);
      }
      return true;
    };
    const allowedKeys = Object.keys(contextFields);
    const buildBody = (messagesArr)=>({
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
    const firstReq = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody([
        {
          role: 'user',
          content: contextPrompt
        }
      ]))
    });
    if (!firstReq.ok) throw new Error(`OpenRouter error: ${firstReq.status}`);
    const firstJson = await firstReq.json();
    const firstText = extractChoiceContent(firstJson);
    console.log('📝 Raw context extraction response:', firstText);
    let parsed = tryParse(firstText);
    if (!parsed || !validateSchema(parsed, allowedKeys)) {
      console.warn('⚠️ Context JSON invalid; retrying with corrective system message');
      const fixPrompt = `Return ONLY a valid minified JSON object for these keys: ${allowedKeys.join(', ')}. No prose, no markdown fences.`;
      const retryReq = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody([
          {
            role: 'system',
            content: fixPrompt
          },
          {
            role: 'user',
            content: contextPrompt
          }
        ]))
      });
      if (retryReq.ok) {
        const retryJson = await retryReq.json();
        const retryText = extractChoiceContent(retryJson);
        parsed = tryParse(retryText);
      }
    }
    if (!parsed) return null;
    const flattened = {};
    for (const key of allowedKeys){
      const raw = parsed[key];
      let value = null;
      let reason = 'no_change';
      if (raw && typeof raw === 'object') {
        if (typeof raw.value === 'string') value = raw.value.trim();
        if (typeof raw.reason === 'string') reason = raw.reason;
      } else if (typeof raw === 'string') {
        value = raw.trim(); // backward compat
      }
      const priorVal = prior[key];
      if (!value || value === '') value = priorVal || 'No context';
      if (value === 'No context' && priorVal) value = priorVal; // prefer prior
      if (!godMode && reason === 'ai_spontaneous' && priorVal) {
        value = priorVal;
      }
      flattened[key] = value.slice(0, 120);
    }
    console.log('🔍 Parsed context (flattened):', flattened);
    // Heuristic fallback enhancement for LOCATION & CHARACTER POSITION if model missed a clear cue
    try {
      const lowerAI = (aiResponse || '').toLowerCase();
      const lowerUser = (message || '').toLowerCase();
      const textWindow = lowerUser + ' \n ' + lowerAI;
      // Simple location phrase extraction
      const locationPatterns = [
        /\b(?:at|in|inside|within|on|near|by|beside|outside) (?:the )?([a-z0-9\- ]{2,40}\b)/g,
        /\b(arrives|heads|goes|walks|steps|moves) (?:to|into|inside|toward|onto) (?:the )?([a-z0-9\- ]{2,40}\b)/g,
        /\b(beach|forest|cabin|room|bedroom|kitchen|hallway|garden|park|library|classroom|office|street|shore|mountain|camp|campfire|market|plaza|docks|harbor)\b/g
      ];
      const priorLocation = prior.location || prior.location_tracking || prior.locationTracking;
      let detectedLoc = null;
      for (const pattern of locationPatterns){
        let m;
        while ((m = pattern.exec(textWindow)) !== null){
          const group = m[m.length - 1];
          if (group) {
            detectedLoc = group.trim();
          }
        }
      }
      if (detectedLoc && detectedLoc.length <= 40) {
        const existing = flattened['location'];
        if ((!existing || existing === priorLocation || existing === 'No context') && detectedLoc !== existing) {
          flattened['location'] = detectedLoc;
          console.log('📍 Heuristic location update applied:', detectedLoc);
        }
      }
      // Character position heuristics
      if (flattened['character_position']) {
        const existingPos = flattened['character_position'];
        // If model returned prior unchanged but we see a new posture word, update
        const postureKeywords = [
          'sitting',
          'sits',
          'squat',
          'squatting',
          'standing',
          'stands',
          'leaning',
          'leans',
          'lying',
          'laying',
          'reclining',
          'crouching',
          'kneeling',
          'running',
          'walking',
          'pacing',
          'folds her arms',
          'folding her arms',
          'cross-legged',
          'perched'
        ];
        const found = postureKeywords.filter((k)=>lowerAI.includes(k));
        if (found.length > 0) {
          const concise = found.slice(0, 2).join(', ').replace(/s$/, '');
          if (concise && concise.length < 50 && !existingPos.toLowerCase().includes(concise.split(',')[0])) {
            flattened['character_position'] = concise;
            console.log('🧍 Heuristic character_position update applied:', concise);
          }
        }
      }
    } catch (heurErr) {
      console.warn('⚠️ Heuristic enhancement failed (non-fatal):', heurErr);
    }
    // === USER INTENT GATING (prevents spontaneous drift) ===
    try {
      if (!godMode) {
        const intentRegex = /(change|put on|take off|remove|switch|swap|go to|move to|head to|walk to|enter|leave|travel to|pick up|drop|equip|unequip|wear|put .* on|move over to|step into|steps into|heads toward|heads to)/i;
        const userShowsIntent = intentRegex.test(message || '');
        if (!userShowsIntent) {
          const gateFields = [
            'mood',
            'clothing',
            'location',
            'time_weather',
            'character_position'
          ];
          let gatedCount = 0;
          for (const f of gateFields){
            const priorVal = prior[f];
            if (priorVal && flattened[f] && flattened[f] !== priorVal) {
              console.log(`🚫 Gated spontaneous change for ${f}: '${flattened[f]}' -> reverting to prior '${priorVal}'`);
              flattened[f] = priorVal;
              gatedCount++;
            }
          }
          if (gatedCount > 0) {
            console.log(`🔒 User intent gating reverted ${gatedCount} field(s) due to lack of explicit user intent.`);
          }
        }
      }
    } catch (gateErr) {
      console.warn('⚠️ User intent gating failed (non-fatal):', gateErr);
    }
    return flattened;
  } catch (error) {
    console.error('Context extraction error:', error);
  }
  return null;
}
export async function saveContextUpdates(extractedContext, addonSettings, userId, chatId, characterId, supabase, options = {}) {
  if (!extractedContext || !addonSettings) return;
  // Fetch existing persisted context so we don't erase unchanged fields
  let existing = null;
  try {
    const { data: existingRow } = await supabase.from('chat_context').select('current_context').eq('chat_id', chatId).maybeSingle();
    existing = existingRow?.current_context || null;
  } catch (e) {
    console.warn('⚠️ Failed to fetch existing chat_context (continuing with null):', e);
  }
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
  // Start with existing (so unchanged fields persist)
  const contextData = {
    mood: existing?.mood ?? null,
    clothing: existing?.clothing ?? null,
    location: existing?.location ?? null,
    relationship: existing?.relationship ?? null,
    time_weather: existing?.time_weather ?? null,
    character_position: existing?.character_position ?? null,
    conversation_tone: existing?.conversation_tone ?? null,
    urgency_level: existing?.urgency_level ?? null
  };
  let hasUpdates = false;
  for (const { setting, field } of contextMappings){
    if (!addonSettings[setting]) continue; // skip disabled addons
    const newValue = extractedContext[field]; // only present when model signaled change
    if (typeof newValue === 'string' && newValue && newValue !== 'No context') {
      if (contextData[field] !== newValue) {
        contextData[field] = newValue; // apply change
        hasUpdates = true;
        console.log(`💾 Updated ${field} context ->`, newValue);
      }
    } else {
    // No new value provided -> keep existing as-is
    // (Do NOT null it out; this preserves prior state until an explicit update arrives)
    }
  }
  // If forcing persist for first-time baseline and we still have no row, allow upsert (will just store existing merged nulls)
  if (!hasUpdates && !options.forcePersist) {
    console.log('⏭️ No context changes detected; skipping persist (existing values retained in DB)');
    return;
  }
  try {
    const { error } = await supabase.from('chat_context').upsert({
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
      console.log('✅ Context saved (merged) to chat_context table');
      // Also update latest AI message with FULL merged context for UI
      try {
        const messageContext = dbToUi(contextData);
        const { data: latestMessage, error: messageError } = await supabase.from('messages').select('id').eq('chat_id', chatId).eq('is_ai_message', true).order('created_at', {
          ascending: false
        }).limit(1).single();
        if (messageError) {
          console.error('❌ Failed to find latest AI message:', messageError);
        } else if (latestMessage) {
          const { error: updateError } = await supabase.from('messages').update({
            current_context: messageContext,
            updated_at: new Date().toISOString()
          }).eq('id', latestMessage.id);
          if (updateError) console.error('❌ Failed to update latest AI message with merged context:', updateError);
          else console.log('✅ Latest AI message updated with merged context');
        }
      } catch (msgErr) {
        console.error('❌ Error updating latest AI message with merged context:', msgErr);
      }
    }
  } catch (err) {
    console.error('Context update error:', err);
  }
}

