/**
 * Shared Template Replacement Utility
 * Consolidates template replacement logic used across multiple edge functions
 */

export interface TemplateContext {
  userName: string;
  charName: string;
}

/**
 * Standard template replacement function
 * Replaces {{user}} and {{char}} placeholders in content
 */
export function replaceTemplates(content: string, context: TemplateContext): string {
  if (!content) return content;
  
  return content
    .replace(/\{\{user\}\}/g, context.userName)
    .replace(/\{\{char\}\}/g, context.charName);
}

/**
 * Create template replacer function with user/character data
 */
export function createTemplateReplacer(
  userPersona: any,
  userProfile: any, 
  characterName: string
): (content: string) => string {
  const userName = userPersona?.name || userProfile?.username || 'User';
  const charName = characterName || 'Character';
  
  console.log('🔧 Template replacement setup - userName:', userName, 'charName:', charName);
  
  return (content: string) => replaceTemplates(content, { userName, charName });
}
