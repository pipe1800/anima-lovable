import type { 
  Character, 
  AddonSettings, 
  TemplateContext, 
  CurrentContext,
  ConversationMessage 
} from '../types/streaming-interfaces.ts';

/**
 * Message generation and AI response handling
 * Handles system prompt building and OpenRouter API communication
 * Separate from context extraction - uses user's plan-based model
 */

export function buildSystemPrompt(
  character: Character,
  addonSettings: AddonSettings,
  templateContext: TemplateContext,
  currentContext: CurrentContext,
  selectedPersona: { name?: string; bio?: string; lore?: string } | null,
  replaceTemplatesFn: (content: string) => string
): string {
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
- STOP your response when it's the user's turn to speak
- Focus primarily on dialogue and conversation as the character
- Use direct speech frequently with quotation marks
- Keep narrative descriptions brief and essential
- Respond with natural, engaging conversation as your character
- Express emotions and thoughts through words and dialogue
- Avoid lengthy descriptive paragraphs
- Make your character feel alive through speech

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
    if (addonSettings.dynamicWorldInfo) {
      systemPrompt += '\n\nUse relevant world information to enhance your responses.';
    }
  }

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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': globalThis.Deno?.env?.get('SITE_URL') || 'https://yourapp.com',
      'X-Title': 'AnimaChat-Streaming'
    },
    body: JSON.stringify({
      model: model, // User's plan-based model (different from context extraction)
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1000
    })
  });

  return response;
}
