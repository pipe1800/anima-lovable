import React from 'react';
import { parseMessageContent } from '@/lib/utils/messageFormatting';

export interface FormattedMessageProps {
  content: string;
  className?: string;
}

export function FormattedMessage({ content, className = '' }: FormattedMessageProps) {
  const segments = parseMessageContent(content);
  
  return (
    <span className={className}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'speech':
            return (
              <span key={index} className="text-blue-300">
                "{segment.content}"
              </span>
            );
          case 'action':
            return (
              <span key={index} className="text-purple-300 italic">
                *{segment.content}*
              </span>
            );
          case 'emphasis':
            return (
              <span key={index} className="font-semibold text-yellow-300">
                _{segment.content}_
              </span>
            );
          case 'parenthetical':
            return (
              <span key={index} className="text-gray-400 italic">
                ({segment.content})
              </span>
            );
          default:
            return (
              <span key={index} className="text-current">
                {segment.content}
              </span>
            );
        }
      })}
    </span>
  );
}