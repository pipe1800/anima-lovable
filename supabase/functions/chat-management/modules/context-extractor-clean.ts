import type { 
  Character, 
  AddonSettings, 
  TemplateContext, 
  ContextData, 
  SupabaseClient 
} from '../types/streaming-interfaces.ts';

/**
 * Context extraction utilities for CHARACTER AND WORLD INFO ONLY
 * This file handles general context extraction, NOT addon-specific context
 * Addon context extraction is handled by the separate extract-addon-context function
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
      const characterSection = `## ${character.name || 'Unknown Character'}\n`;
      let characterContent = '';
      
      if (character.description) {
        characterContent += `Description: ${character.description}\n`;
      }
      
      if (character.personality) {
        characterContent += `Personality: ${character.personality}\n`;
      }
      
      if (character.scenario) {
        characterContent += `Scenario: ${character.scenario}\n`;
      }
      
      if (character.context) {
        characterContent += `Context: ${character.context}\n`;
      }
      
      if (character.first_message) {
        characterContent += `First Message: ${character.first_message}\n`;
      }
      
      if (character.example_conversations) {
        characterContent += `Example Conversations: ${character.example_conversations}\n`;
      }
      
      const fullCharacterSection = characterSection + characterContent + '\n';
      
      // Rough token estimation (4 chars per token)
      const sectionTokens = Math.ceil(fullCharacterSection.length / 4);
      
      if (tokenCount + sectionTokens <= maxTokens) {
        consolidatedContext += fullCharacterSection;
        tokenCount += sectionTokens;
      } else {
        console.log(`⚠️ Reached token limit, skipping character: ${character.name}`);
        break;
      }
    }
  }

  // Process world infos
  if (worldInfos && worldInfos.length > 0 && tokenCount < maxTokens) {
    consolidatedContext += '[WORLD INFORMATION]\n';
    
    for (const worldInfo of worldInfos) {
      const worldInfoSection = `## ${worldInfo.name}\n${worldInfo.content}\nKeywords: ${worldInfo.keywords.join(', ')}\n\n`;
      
      // Rough token estimation (4 chars per token)
      const sectionTokens = Math.ceil(worldInfoSection.length / 4);
      
      if (tokenCount + sectionTokens <= maxTokens) {
        consolidatedContext += worldInfoSection;
        tokenCount += sectionTokens;
      } else {
        console.log(`⚠️ Reached token limit, skipping world info: ${worldInfo.name}`);
        break;
      }
    }
  }

  console.log(`✅ Context extraction completed. Total estimated tokens: ${tokenCount}`);
  
  return { context: consolidatedContext, characterCount: charactersData.length, worldInfoCount: worldInfos.length, totalTokens: tokenCount };
}

/**
 * Extract character context for specific character operations
 * This is for character-specific context, not addon context
 */
export async function extractCharacterContext(
  character: Character,
  templateContext: TemplateContext,
  replaceTemplates: (content: string) => string
): Promise<string> {
  console.log('🎭 Extracting character context for:', character.name);
  
  let context = '';
  
  // Add character name and basic info
  if (character.name) {
    context += `Character: ${character.name}\n`;
  }
  
  // Add character definitions if available
  if (character.character_definitions) {
    const def = character.character_definitions;
    
    if (def.personality_summary) {
      context += `Personality: ${replaceTemplates(def.personality_summary)}\n`;
    }
    
    if (def.description) {
      context += `Description: ${replaceTemplates(def.description)}\n`;
    }
    
    if (def.scenario) {
      const scenarioText = typeof def.scenario === 'string' 
        ? def.scenario 
        : JSON.stringify(def.scenario);
      context += `Scenario: ${replaceTemplates(scenarioText)}\n`;
    }
    
    if (def.greeting) {
      context += `Greeting: ${replaceTemplates(def.greeting)}\n`;
    }
  }
  
  console.log(`✅ Character context extracted (${context.length} characters)`);
  
  return context;
}
