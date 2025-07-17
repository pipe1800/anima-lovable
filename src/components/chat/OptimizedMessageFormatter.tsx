import React, { useMemo } from 'react';

interface OptimizedMessageFormatterProps {
  content: string;
  isAiMessage: boolean;
  characterName?: string;
  timestamp?: string;
}

export const OptimizedMessageFormatter: React.FC<OptimizedMessageFormatterProps> = ({
  content,
  isAiMessage,
  characterName,
  timestamp
}) => {
  // Memoize the formatted content to avoid re-processing
  const formattedContent = useMemo(() => {
    if (!content) return '';
    
    // Apply character-specific formatting
    let processedContent = content;
    
    // Handle character actions (text between asterisks)
    if (isAiMessage) {
      processedContent = processedContent.replace(
        /\*([^*]+)\*/g,
        '<span class="text-purple-300 italic">*$1*</span>'
      );
    }
    
    // Handle emphasis (text between underscores)
    processedContent = processedContent.replace(
      /_([^_]+)_/g,
      '<span class="font-semibold text-yellow-300">$1</span>'
    );
    
    // Handle dialogue (text between quotes)
    processedContent = processedContent.replace(
      /"([^"]+)"/g,
      '<span class="text-blue-300">"$1"</span>'
    );
    
    // Handle thoughts (text between parentheses)
    processedContent = processedContent.replace(
      /\(([^)]+)\)/g,
      '<span class="text-gray-400 italic">($1)</span>'
    );
    
    return processedContent;
  }, [content, isAiMessage]);

  // Memoize the timestamp formatting
  const formattedTimestamp = useMemo(() => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '';
    }
  }, [timestamp]);

  return (
    <div className="group">
      <div className="flex items-start space-x-3">
        {isAiMessage && (
          <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
            <span className="text-primary font-semibold text-sm">
              {characterName?.[0] || 'AI'}
            </span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className={`rounded-lg p-3 prose prose-sm max-w-none ${
            isAiMessage 
              ? 'bg-secondary/30 text-foreground' 
              : 'bg-primary/20 text-primary-foreground ml-auto max-w-[70%]'
          }`}>
            <div 
              className="whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: formattedContent }}
            />
          </div>
          
          {formattedTimestamp && (
            <div className={`text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${
              isAiMessage ? 'text-left' : 'text-right'
            }`}>
              {formattedTimestamp}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptimizedMessageFormatter;