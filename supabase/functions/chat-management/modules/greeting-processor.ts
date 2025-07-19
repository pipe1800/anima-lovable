/**
 * Greeting Processor Module
 * 
 * Handles greeting generation, template replacement, and context integration
 * for the create-chat-with-greeting function.
 */

import type { AddonSettings } from '../types/interfaces.ts';

export interface TemplateReplacer {
  (content: string): string;
}

export interface GreetingProcessingResult {
  processedGreeting: string;
  messageContext: Record<string, any>;
}

/**
 * Create template replacement function
 */
export function createTemplateReplacer(
  userPersona: any,
  userProfile: any,
  characterName: string
): TemplateReplacer {
  const userName = userPersona?.name || userProfile?.username || 'User';
  const charName = characterName || 'Character';
  
  console.log('🔧 Template replacement setup - userName:', userName, 'charName:', charName);
  
  return (content: string): string => {
    if (!content) return content;
    
    const replaced = content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
    
    if (content !== replaced) {
      console.log('🔄 Template replaced:', content, '->', replaced);
    }
    
    return replaced;
  };
}

/**
 * Generate processed greeting from character definitions
 */
export function generateGreeting(
  character: any,
  characterName: string,
  templateReplacer: TemplateReplacer
): string {
  console.log('🎭 Generating greeting...');
  
  const rawGreeting = character.character_definitions?.greeting || 
    `Hello! I'm ${characterName}. It's great to meet you. What would you like to talk about?`;
  
  const processedGreeting = templateReplacer(rawGreeting);
  
  console.log('✅ Processed greeting:', processedGreeting);
  return processedGreeting;
}

/**
 * Build message context from initial context and addon settings
 */
export function buildMessageContext(
  initialContext: Record<string, any> | null,
  addonSettings: AddonSettings | undefined
): Record<string, any> {
  const messageContext: Record<string, any> = {};
  
  if (initialContext && addonSettings) {
    Object.entries(initialContext).forEach(([field, value]) => {
      if (value && value !== 'No context') {
        // Map context fields to addon setting keys
        const contextKey = mapContextFieldToAddonKey(field);
        
        if (contextKey && addonSettings[contextKey]) {
          messageContext[contextKey] = value;
        }
      }
    });
  }
  
  console.log('🗃️ Built message context:', messageContext);
  return messageContext;
}

/**
 * Map context field names to addon setting keys
 */
function mapContextFieldToAddonKey(field: string): string | null {
  const fieldMapping: Record<string, string> = {
    'mood': 'moodTracking',
    'clothing': 'clothingInventory',
    'location': 'locationTracking',
    'time_weather': 'timeAndWeather',
    'relationship': 'relationshipStatus',
    'character_position': 'characterPosition'
  };
  
  return fieldMapping[field] || null;
}

/**
 * Process greeting with context integration
 */
export function processGreetingWithContext(
  character: any,
  characterName: string,
  userPersona: any,
  userProfile: any,
  initialContext: Record<string, any> | null,
  addonSettings: AddonSettings | undefined
): GreetingProcessingResult {
  console.log('🎭 Processing greeting with context integration...');
  
  // Create template replacement function
  const templateReplacer = createTemplateReplacer(userPersona, userProfile, characterName);
  
  // Generate processed greeting
  const processedGreeting = generateGreeting(character, characterName, templateReplacer);
  
  // Build message context
  const messageContext = buildMessageContext(initialContext, addonSettings);
  
  console.log('✅ Greeting processing complete');
  
  return {
    processedGreeting,
    messageContext
  };
}

/**
 * Enhanced greeting processing with context extraction support
 */
export function createContextTemplateReplacer(
  userPersona: any,
  userProfile: any,
  characterName: string
): TemplateReplacer {
  const userName = userPersona?.name || userProfile?.username || 'User';
  const charName = characterName || 'Character';
  
  return (content: string): string => {
    if (!content) return content;
    
    return content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
  };
}

/**
 * Prepare character data for context extraction
 */
export function prepareCharacterForContext(character: any): any {
  return {
    personality_summary: character.character_definitions?.personality_summary || '',
    description: character.character_definitions?.description || '',
    scenario: character.character_definitions?.scenario || '',
    greeting: character.character_definitions?.greeting || ''
  };
}
