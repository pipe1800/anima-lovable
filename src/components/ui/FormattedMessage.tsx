import React from 'react';
import { parseMessageContent } from '@/lib/utils/messageFormatting';
import { useUserGlobalChatSettings } from '@/data/chats/settings';

export interface FormattedMessageProps {
  content: string;
  className?: string;
  // Optional optimization: reuse provided settings
  settingsOverride?: any;
}

export function FormattedMessage({ content, className = '', settingsOverride }: FormattedMessageProps) {
  // Normalize line endings first
  const normalized = content.replace(/\r\n?/g, '\n').trim();
  // Split into paragraphs on 2+ newlines (blank line separation)
  const paragraphStrings = normalized.split(/\n{2,}/).filter(p => p.length);
  const { data: settings } = useUserGlobalChatSettings();
  const effectiveSettings = settingsOverride || settings;

  const mode = effectiveSettings?.semantic_overrides_mode || 'default';
  const colors = {
    speech: effectiveSettings?.speech_color || '#93C5FD',
    action: effectiveSettings?.action_color || '#D8B4FE',
    emphasis: effectiveSettings?.emphasis_color || '#FDE68A',
    parenthetical: effectiveSettings?.parenthetical_color || '#9CA3AF',
  };

  const segmentStyle = (type: string): React.CSSProperties | undefined => {
    if (mode === 'disabled') return undefined;
    if (mode === 'custom') {
      switch (type) {
        case 'speech': return { color: colors.speech };
        case 'action': return { color: colors.action, fontStyle: 'italic' };
        case 'emphasis': return { color: colors.emphasis, fontWeight: 600 };
        case 'parenthetical': return { color: colors.parenthetical, fontStyle: 'italic' };
      }
    }
    return undefined;
  };

  const segmentClass = (type: string): string => {
    if (mode === 'disabled' || mode === 'custom') return 'text-current';
    switch (type) {
      case 'speech': return 'text-blue-300';
      case 'action': return 'text-purple-300 italic';
      case 'emphasis': return 'font-semibold text-yellow-300';
      case 'parenthetical': return 'text-gray-400 italic';
      default: return 'text-current';
    }
  };
  
  return (
    <div className={`formatted-message space-y-3 whitespace-pre-line ${className}`}>
      {paragraphStrings.map((para, pIdx) => {
        const segments = parseMessageContent(para);
        // Within a paragraph, preserve single newlines by splitting segment content and inserting <br />
        return (
          <p key={pIdx} className="leading-relaxed break-words m-0">
            {segments.map((segment, sIdx) => {
              const parts = segment.content.split('\n');
              return (
                <React.Fragment key={sIdx}>
                  {parts.map((part, i) => (
                    <span key={i} className={segmentClass(segment.type)} style={segmentStyle(segment.type)}>
                      {segment.type === 'speech' ? '"' : segment.type === 'action' ? '*' : segment.type === 'emphasis' ? '_' : segment.type === 'parenthetical' ? '(' : ''}
                      {part}
                      {segment.type === 'speech' ? '"' : segment.type === 'action' ? '*' : segment.type === 'emphasis' ? '_' : segment.type === 'parenthetical' ? ')' : ''}
                      {i < parts.length - 1 && <br />}
                    </span>
                  ))}
                </React.Fragment>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}