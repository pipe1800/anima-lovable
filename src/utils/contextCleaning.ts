// Utility functions for cleaning contaminated chat messages
// This prevents context data from appearing in user-visible messages

/**
 * Strips context data patterns from streaming content
 * @param content - The content to clean
 * @returns Cleaned content without context patterns
 */
export const stripContextFromContent = (content: string): string => {
  if (!content) return content;
  
  // Check if content contains context patterns
  const hasContextPatterns = content.includes('[CONTEXT') || 
    content.includes('"mood"') || content.includes('"location"') ||
    content.includes('"clothing"') || content.includes('"time_weather"') ||
    content.includes('"relationship"') || content.includes('"character_position"');
  
  if (!hasContextPatterns) return content;
  
  console.warn('🧹 Cleaning contaminated content with context patterns');
  
  return content
    // Remove context data blocks
    .replace(/\[CONTEXT_DATA\][\s\S]*?\[\/CONTEXT_DATA\]/g, '')
    .replace(/\[CONTEXTDATA\][\s\S]*?\[\/CONTEXTDATA\]/g, '')
    .replace(/\[CONTEXT_DATA\][\s\S]*$/g, '')
    .replace(/\[CONTEXTDATA\][\s\S]*$/g, '')
    .replace(/^[\s\S]*?\[\/CONTEXT_DATA\]/g, '')
    .replace(/^[\s\S]*?\[\/CONTEXTDATA\]/g, '')
    
    // Remove JSON context objects
    .replace(/\{[\s\S]*"mood"[\s\S]*\}/g, '')
    .replace(/\{[\s\S]*"location"[\s\S]*\}/g, '')
    .replace(/\{[\s\S]*"clothing"[\s\S]*\}/g, '')
    .replace(/\{[\s\S]*"time_weather"[\s\S]*\}/g, '')
    .replace(/\{[\s\S]*"relationship"[\s\S]*\}/g, '')
    .replace(/\{[\s\S]*"character_position"[\s\S]*\}/g, '')
    
    // Remove partial JSON and context patterns
    .replace(/\{[\s\S]*$/g, '')
    .replace(/^[\s\S]*?\}/g, '')
    .replace(/"[a-z_]+"\s*:[\s\S]*$/g, '')
    .replace(/\[CONTEXT[^}]*$/g, '')
    .trim();
};

/**
 * Strips context data from streaming chunks (lighter version for real-time processing)
 * @param chunk - The streaming chunk to clean
 * @returns Cleaned chunk
 */
export const stripContextFromChunk = (chunk: string): string => {
  if (!chunk) return chunk;
  
  // Quick check for context patterns
  const hasContextPatterns = chunk.includes('[CONTEXT') || chunk.includes('"mood"') || 
    chunk.includes('"location"') || chunk.includes('"clothing"') ||
    chunk.includes('"time_weather"') || chunk.includes('"relationship"') ||
    chunk.includes('"character_position"') || chunk.includes('{');
  
  if (!hasContextPatterns) return chunk;
  
  return chunk
    .replace(/\[CONTEXT_DATA\][\s\S]*?\[\/CONTEXT_DATA\]/g, '')
    .replace(/\[CONTEXT[^}]*$/g, '')
    .replace(/\{[\s\S]*$/g, '')
    .replace(/"[a-z_]+"\s*:[\s\S]*$/g, '');
};
