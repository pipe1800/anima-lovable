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
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readString = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) return undefined;
  const entry = value[key];
  return typeof entry === 'string' && entry.trim().length > 0 ? entry : undefined;
};

export function createTemplateReplacer(
  userPersona: unknown,
  userProfile: unknown,
  characterName: string
): (content: string) => string {
  const personaName = readString(userPersona, 'name');
  const profileName = readString(userProfile, 'username');
  const userName = personaName || profileName || 'User';
  const charName = characterName || 'Character';
  
  console.log('🔧 Template replacement setup - userName:', userName, 'charName:', charName);
  
  return (content: string) => replaceTemplates(content, { userName, charName });
}
