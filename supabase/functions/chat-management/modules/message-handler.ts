import type { 
  Character, 
  AddonSettings, 
  TemplateContext, 
  CurrentContext,
  ConversationMessage,
  SupabaseClient
} from '../types/streaming-interfaces.ts';
import {
  estimateTokens,
  calculateMessageTokens,
} from './message-counter.ts';
import { getMostRecentAutoSummary } from './auto-summary-new.ts';

/**
 * Message generation and AI response handling
 * Handles system prompt   console.log('📤 OpenRouter request payload:', JSON.stringify({
    model: payload.model,
    messagesCount: payload.messages.length,
    stream: payload.stream,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    totalEstimatedTokens: payload.messages.reduce((total, msg) => total + estimateTokens(msg.content), 0),
    messages: payload.messages.map((m, index) => ({ 
      index,
      role: m.role, 
      contentLength: m.content.length,
      estimatedTokens: estimateTokens(m.content),
      contentPreview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
    }))
  }, null, 2));

  // CRITICAL: Calculate actual tokens being sent for debugging
  const actualTokenCount = payload.messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content) + 4; // +4 for role overhead per message
  }, 0);
  
  const systemMessage = payload.messages.find(m => m.role === 'system');
  
  console.log('🚨 TOKEN DISCREPANCY ANALYSIS:', {
    calculatedTokensInPayload: actualTokenCount,
    systemPromptTokens: systemMessage ? estimateTokens(systemMessage.content) : 0,
    systemPromptLength: systemMessage?.content?.length || 0,
    totalMessagesInPayload: payload.messages.length,
    totalCharactersInPayload: payload.messages.reduce((sum, m) => sum + m.content.length, 0),
    warningIfOver11k: actualTokenCount > 11000 ? '⚠️ EXCEEDS 11K TOKENS - SHOULD TRIGGER SUMMARY!' : 'Under 11k tokens'
  });enRouter API communication
 * Separate from context extraction - uses user's plan-based model
 */

/**
 * Filter world info entries based on keyword relevance to the conversation
 */
function getRelevantWorldInfo(
  worldInfoEntries: Array<{ keywords: string[]; entry_text: string }>,
  userMessage: string,
  conversationHistory: any[]
): Array<{ keywords: string[]; entry_text: string }> {
  if (!worldInfoEntries || worldInfoEntries.length === 0) return [];

  // Combine user message and recent conversation for context
  const recentMessages = conversationHistory.slice(-5); // Last 5 messages
  const conversationText = [
    userMessage,
    ...recentMessages.map(msg => msg.content || '')
  ].join(' ').toLowerCase();

  console.log('🔍 World Info Keyword Filtering:', {
    conversationText: conversationText.substring(0, 200) + '...',
    totalEntries: worldInfoEntries.length,
    entryKeywords: worldInfoEntries.map(entry => entry.keywords)
  });

  // Filter entries where at least one keyword appears in the conversation
  const relevantEntries = worldInfoEntries.filter(entry => {
    if (!entry.keywords || entry.keywords.length === 0) return false;
    
    const matchedKeywords = entry.keywords.filter(keyword => {
      const normalizedKeyword = keyword.toLowerCase().trim();
      const isMatch = conversationText.includes(normalizedKeyword);
      
      if (isMatch) {
        console.log(`✅ Keyword match found: "${keyword}" in conversation`);
      }
      
      return isMatch;
    });
    
    const hasMatch = matchedKeywords.length > 0;
    console.log(`📝 Entry with keywords [${entry.keywords.join(', ')}]: ${hasMatch ? 'INCLUDED' : 'EXCLUDED'}`);
    
    return hasMatch;
  });

  console.log(`🎯 Filtered ${relevantEntries.length} relevant entries from ${worldInfoEntries.length} total`);

  // Limit to prevent token bloat (max 3 entries)
  return relevantEntries.slice(0, 3);
}

/**
 * Filter character memories based on keyword relevance to the conversation
 */
function getRelevantMemories(
  memories: Array<{ summary_content: string; trigger_keywords: string[]; created_at: string }>,
  userMessage: string,
  conversationHistory: any[]
): Array<{ summary_content: string; trigger_keywords: string[]; created_at: string }> {
  if (!memories || memories.length === 0) return [];

  // Combine user message and recent conversation for context
  const recentMessages = conversationHistory.slice(-5); // Last 5 messages
  const conversationText = [
    userMessage,
    ...recentMessages.map(msg => msg.content || '')
  ].join(' ').toLowerCase();

  console.log('🧠 Memory Keyword Filtering:', {
    conversationText: conversationText.substring(0, 200) + '...',
    totalMemories: memories.length,
    memoryKeywords: memories.map(memory => memory.trigger_keywords)
  });

  // Filter memories where at least one keyword appears in the conversation
  const relevantMemories = memories.filter(memory => {
    if (!memory.trigger_keywords || memory.trigger_keywords.length === 0) return false;
    
    const matchedKeywords = memory.trigger_keywords.filter(keyword => {
      const normalizedKeyword = keyword.toLowerCase().trim();
      const isMatch = conversationText.includes(normalizedKeyword);
      
      if (isMatch) {
        console.log(`✅ Memory keyword match found: "${keyword}" in conversation`);
      }
      
      return isMatch;
    });
    
    const hasMatch = matchedKeywords.length > 0;
    console.log(`🧠 Memory with keywords [${memory.trigger_keywords.join(', ')}]: ${hasMatch ? 'INCLUDED' : 'EXCLUDED'}`);
    
    return hasMatch;
  });

  console.log(`🎯 Filtered ${relevantMemories.length} relevant memories from ${memories.length} total`);

  // Sort by date (most recent first) and limit to prevent token bloat (max 3 memories)
  return relevantMemories
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);
}

export async function buildSystemPrompt(
  character: Character,
  addonSettings: AddonSettings,
  templateContext: TemplateContext,
  currentContext: CurrentContext,
  selectedPersona: { name?: string; bio?: string; lore?: string } | null,
  replaceTemplatesFn: (content: string) => string,
  supabase: SupabaseClient,
  worldInfoEntries?: Array<{ keywords: string[]; entry_text: string }> | null,
  userMessage?: string,
  conversationHistory?: any[],
  characterMemories?: Array<{ summary_content: string; trigger_keywords: string[]; created_at: string }> | null,
  chatMode?: 'storytelling' | 'companion'
): Promise<string> {
  console.log('🎯 buildSystemPrompt called with:', {
    character: character ? 'loaded' : 'null',
    addonSettings,
    worldInfoEntries: worldInfoEntries ? `${worldInfoEntries.length} entries` : 'null',
    characterMemories: characterMemories ? `${characterMemories.length} memories` : 'null',
    userMessage: userMessage ? userMessage.substring(0, 100) + '...' : 'null',
    conversationHistoryLength: conversationHistory?.length || 0,
    dynamicWorldInfoSetting: addonSettings?.dynamicWorldInfo,
    enhancedMemorySetting: addonSettings?.enhancedMemory
  });

  let systemPrompt = `You are ${replaceTemplatesFn(character.personality_summary || 'a helpful assistant')}.
    
${character.description ? `Description: ${replaceTemplatesFn(character.description)}` : ''}
${character.scenario ? `Scenario: ${replaceTemplatesFn(typeof character.scenario === 'string' ? character.scenario : JSON.stringify(character.scenario))}` : ''}`;

  // Add user persona information if available
  if (selectedPersona && (selectedPersona.bio || selectedPersona.lore)) {
    systemPrompt += '\n\n[USER PERSONA INFORMATION]';
    if (selectedPersona.bio) {
      systemPrompt += `\nUser Bio: ${selectedPersona.bio}`;
    }
    if (selectedPersona.lore) {
      systemPrompt += `\nUser Background & Lore: ${selectedPersona.lore}`;
    }
    systemPrompt += '\nRespond to the user accordingly, taking their persona traits and background into consideration.';
    systemPrompt += '\n[/USER PERSONA INFORMATION]';
  }

  systemPrompt += `

IMPORTANT DIALOGUE GUIDELINES:
- You are ONLY the character, never speak for the user
- NEVER write the user's responses or actions
- NEVER continue the conversation for the user
- STOP your response when it's the user's turn to speak`;

  // Add chat mode specific guidelines
  if (chatMode === 'companion') {
    systemPrompt += `

## CRITICAL COMPANION MODE RULES - HIGHEST PRIORITY

YOU ARE IN COMPANION MODE. THESE RULES OVERRIDE ALL OTHER INSTRUCTIONS:

1. **RESPOND ONLY WITH DIALOGUE** - Your response must contain ONLY what ${character.name} says. Nothing else.

2. **ABSOLUTELY FORBIDDEN**:
   - NO descriptions of actions, emotions, or movements
   - NO text between asterisks (*) or tildes (~)
   - NO narration or scene-setting
   - NO descriptions of clothing, appearance, or environment
   - NO parenthetical statements
   - NO third-person observations
   - NO stage directions

3. **IGNORE CONTEXT IN EXAMPLES** - Even if the character's greeting or example messages contain descriptions, actions, or narration, you MUST NOT include any in your responses.

4. **CORRECT FORMAT**:
   ✓ "Hello! How are you today?"
   ✓ "That's interesting. Tell me more about it."
   
5. **INCORRECT FORMAT**:
   ✗ "*smiles* Hello! How are you today?"
   ✗ "Hello! *waves enthusiastically* How are you today?"
   ✗ "(Speaking softly) Hello! How are you today?"

REMEMBER: You are having a text conversation. Respond as if you're texting or instant messaging - pure dialogue only.`;
  } else {
    systemPrompt += `

## STORYTELLING MODE ACTIVE

You are in STORYTELLING MODE. You should:
- Include rich descriptions of actions, emotions, and environment
- Use asterisks (*) for actions and descriptions
- Set the scene and create atmosphere
- Describe ${character.name}'s appearance, movements, and emotional state when relevant
- Create an immersive narrative experience
- Focus primarily on dialogue and conversation as the character
- Use direct speech frequently with quotation marks
- Keep narrative descriptions brief and essential
- Respond with natural, engaging conversation as your character
- Express emotions and thoughts through words and dialogue
- Avoid lengthy descriptive paragraphs
- Make your character feel alive through speech

Balance dialogue with descriptive elements to create an engaging story.`;
  }

  systemPrompt += `

CRITICAL: You must ONLY play your character. Never write what the user says, thinks, or does. Stop your response when it's the user's turn to speak.

Stay in character and engage in natural dialogue with the user.`;

  // Add current context if available and relevant addons are enabled
  if (currentContext && addonSettings) {
    const contextParts: string[] = [];

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

    console.log('🔍 World Info Processing Check:', {
      dynamicWorldInfoEnabled: addonSettings.dynamicWorldInfo,
      hasWorldInfoEntries: !!worldInfoEntries && worldInfoEntries.length > 0,
      hasUserMessage: !!userMessage,
      willProcessWorldInfo: addonSettings.dynamicWorldInfo && worldInfoEntries && worldInfoEntries.length > 0 && userMessage
    });

    if (addonSettings.dynamicWorldInfo && worldInfoEntries && worldInfoEntries.length > 0 && userMessage) {
      console.log('🌍 Processing world info for system prompt...');
      
      // Filter to only relevant world info entries
      const relevantEntries = getRelevantWorldInfo(worldInfoEntries, userMessage, conversationHistory || []);
      
      console.log('🎯 Relevant world info entries:', {
        originalCount: worldInfoEntries.length,
        filteredCount: relevantEntries.length,
        relevantEntries: relevantEntries.map(entry => ({
          keywords: entry.keywords,
          textPreview: entry.entry_text.substring(0, 100) + '...'
        }))
      });
      
      if (relevantEntries.length > 0) {
        systemPrompt += '\n\n[WORLD INFORMATION]';
        systemPrompt += '\nUse this world information to enhance your responses when relevant:';
        
        for (const entry of relevantEntries) {
          systemPrompt += `\n\n- Keywords: ${entry.keywords.join(', ')}`;
          systemPrompt += `\n  Content: ${entry.entry_text}`;
        }
        
        systemPrompt += '\n[/WORLD INFORMATION]';
        systemPrompt += '\nReference this world information naturally when it\'s relevant to the conversation.';
        
        console.log('✅ World information added to system prompt');
      } else {
        console.log('❌ No relevant world info entries found after filtering');
      }
    } else {
      console.log('❌ World info processing skipped:', {
        dynamicWorldInfoEnabled: addonSettings.dynamicWorldInfo,
        hasWorldInfoEntries: !!worldInfoEntries && worldInfoEntries.length > 0,
        hasUserMessage: !!userMessage
      });
    }

    // Enhanced Memory Processing
    console.log('🔍 Memory Processing Check:', {
      enhancedMemoryEnabled: addonSettings.enhancedMemory,
      hasCharacterMemories: !!characterMemories && characterMemories.length > 0,
      hasUserMessage: !!userMessage,
      willProcessMemories: addonSettings.enhancedMemory && characterMemories && characterMemories.length > 0 && userMessage
    });

    if (addonSettings.enhancedMemory && characterMemories && characterMemories.length > 0 && userMessage) {
      console.log('🧠 Processing character memories for system prompt...');
      
      // Filter to only relevant memories
      const relevantMemories = getRelevantMemories(characterMemories, userMessage, conversationHistory || []);
      
      console.log('🎯 Relevant character memories:', {
        originalCount: characterMemories.length,
        filteredCount: relevantMemories.length,
        relevantMemories: relevantMemories.map(memory => ({
          keywords: memory.trigger_keywords,
          contentPreview: memory.summary_content.substring(0, 100) + '...',
          date: memory.created_at
        }))
      });
      
      if (relevantMemories.length > 0) {
        systemPrompt += '\n\n[MEMORY BANK]';
        systemPrompt += '\nPrevious interactions with this user:';
        
        for (const memory of relevantMemories) {
          const memoryDate = new Date(memory.created_at).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
          
          systemPrompt += `\n\n- Date: ${memoryDate}`;
          systemPrompt += `\n  Summary: ${memory.summary_content}`;
          systemPrompt += `\n  Keywords: ${memory.trigger_keywords.join(', ')}`;
        }
        
        systemPrompt += '\n[/MEMORY BANK]';
        systemPrompt += '\nReference these memories naturally when relevant keywords appear in the conversation.';
        
        console.log('✅ Character memories added to system prompt');
      } else {
        console.log('❌ No relevant character memories found after filtering');
      }
    } else {
      console.log('❌ Memory processing skipped:', {
        enhancedMemoryEnabled: addonSettings.enhancedMemory,
        hasCharacterMemories: !!characterMemories && characterMemories.length > 0,
        hasUserMessage: !!userMessage
      });
    }
  }

  // Add most recent auto-summary for context continuity
  try {
    console.log('🤖 About to retrieve most recent auto-summary - character details:', {
      characterExists: !!character,
      characterName: character?.name,
      characterId: character?.id,
      characterIdType: typeof character?.id,
      characterIdValue: character?.id
    });
    
    // Validate character.id before calling
    if (!character?.id || character.id === 'undefined') {
      console.warn('⚠️ Skipping auto-summary fetch - invalid character.id:', character?.id);
    } else {
      console.log('🤖 Retrieving most recent auto-summary for character:', character.id);
      const latestSummary = await getMostRecentAutoSummary(character.id, supabase);
    
      if (latestSummary) {
        systemPrompt += '\n\n[CONVERSATION SUMMARY]';
        systemPrompt += '\nMost recent conversation summary:';
        systemPrompt += `\n${latestSummary.summary_content}`;
        systemPrompt += '\n[/CONVERSATION SUMMARY]';
        systemPrompt += '\nUse this summary to maintain continuity with previous conversations.';
        
        console.log('✅ Most recent auto-summary added to system prompt:', {
          summaryName: latestSummary.name,
          summaryLength: latestSummary.summary_content.length,
          messageCount: latestSummary.message_count,
          createdAt: latestSummary.created_at
        });
      } else {
        console.log('❌ No auto-summary found for character:', character.id);
      }
    }
  } catch (error) {
    console.error('⚠️ Error retrieving most recent auto-summary:', error);
    // Continue without auto-summary - this is non-critical
  }

  console.log('📝 Final system prompt length:', systemPrompt.length);
  console.log('📋 System prompt preview:', systemPrompt.substring(0, 500) + '...');

  return systemPrompt;
}

export function buildConversationMessages(
  systemPrompt: string,
  messageHistory: any[],
  userMessage: string
): ConversationMessage[] {
  const conversationContext = messageHistory?.map((msg) => ({
    role: msg.is_ai_message ? 'assistant' : 'user',
    content: msg.content
  })) || [];

  return [
    {
      role: 'system',
      content: systemPrompt
    },
    ...conversationContext,
    {
      role: 'user',
      content: userMessage
    }
  ] as ConversationMessage[];
}

export async function generateAIResponse(
  messages: ConversationMessage[],
  model: string,
  openRouterKey: string
): Promise<Response> {
  console.log('🎯 Generating AI response with model:', model);
  
  const payload = {
    model: model, // User's plan-based model (different from context extraction)
    messages: messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 1000
  };
  
  console.log('📤 OpenRouter request payload:', JSON.stringify({
    model: payload.model,
    messagesCount: payload.messages.length,
    stream: payload.stream,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    totalEstimatedTokens: payload.messages.reduce((total, msg) => total + estimateTokens(msg.content), 0),
    messages: payload.messages.map((m, index) => ({ 
      index,
      role: m.role, 
      contentLength: m.content.length,
      estimatedTokens: estimateTokens(m.content),
      contentPreview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
    }))
  }, null, 2));

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': globalThis.Deno?.env?.get('SITE_URL') || 'https://yourapp.com',
      'X-Title': 'AnimaChat-Streaming'
    },
    body: JSON.stringify(payload)
  });

  return response;
}
