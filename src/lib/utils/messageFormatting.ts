// Utility for parsing and formatting message content
export interface MessageSegment {
  type: 'text' | 'speech' | 'action' | 'emphasis' | 'parenthetical';
  content: string;
}

export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  
  // Regular expressions for different content types
  const speechRegex = /"([^"]+)"/g;
  const actionRegex = /\*([^*]+)\*/g;
  const emphasisRegex = /_([^_]+)_/g;
  const parentheticalRegex = /\(([^)]+)\)/g;
  
  let lastIndex = 0;
  const matches: Array<{ type: 'speech' | 'action' | 'emphasis' | 'parenthetical', content: string, index: number, length: number }> = [];
  
  // Find all speech matches
  let match;
  while ((match = speechRegex.exec(content)) !== null) {
    matches.push({
      type: 'speech',
      content: match[1],
      index: match.index,
      length: match[0].length
    });
  }
  
  // Find all action matches
  while ((match = actionRegex.exec(content)) !== null) {
    matches.push({
      type: 'action',
      content: match[1],
      index: match.index,
      length: match[0].length
    });
  }
  
  // Find all emphasis matches
  while ((match = emphasisRegex.exec(content)) !== null) {
    matches.push({
      type: 'emphasis',
      content: match[1],
      index: match.index,
      length: match[0].length
    });
  }
  
  // Find all parenthetical matches
  while ((match = parentheticalRegex.exec(content)) !== null) {
    matches.push({
      type: 'parenthetical',
      content: match[1],
      index: match.index,
      length: match[0].length
    });
  }
  
  // Sort matches by their position in the text
  matches.sort((a, b) => a.index - b.index);
  
  // Build segments
  for (const match of matches) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        segments.push({
          type: 'text',
          content: textBefore
        });
      }
    }
    
    // Add the match
    segments.push({
      type: match.type,
      content: match.content
    });
    
    lastIndex = match.index + match.length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    const remainingText = content.slice(lastIndex);
    if (remainingText.trim()) {
      segments.push({
        type: 'text',
        content: remainingText
      });
    }
  }
  
  // If no special formatting found, return the entire content as text
  if (segments.length === 0) {
    segments.push({
      type: 'text',
      content: content
    });
  }
  
  return segments;
}