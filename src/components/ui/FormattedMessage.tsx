import React from 'react';
import { parseMessageContent } from '@/lib/utils/messageFormatting';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';

export interface FormattedMessageProps {
  content: string;
  className?: string;
  // Optional optimization: reuse provided settings
  settingsOverride?: any;
}

export function FormattedMessage({ content, className = '', settingsOverride }: FormattedMessageProps) {
  const segments = parseMessageContent(content);
  const { data: settings } = useUserGlobalChatSettings();
  const effectiveSettings = settingsOverride || settings;

  const mode = effectiveSettings?.semantic_overrides_mode || 'default';
  const colors = {
    speech: effectiveSettings?.speech_color || '#93C5FD', // blue-300 fallback
    action: effectiveSettings?.action_color || '#D8B4FE', // purple-300 fallback
    emphasis: effectiveSettings?.emphasis_color || '#FDE68A', // yellow-300 fallback
    parenthetical: effectiveSettings?.parenthetical_color || '#9CA3AF', // gray-400 fallback
  };

  const segmentStyle = (type: string): React.CSSProperties | undefined => {
    if (mode === 'disabled') return undefined; // use text-current everywhere
    if (mode === 'custom') {
      switch (type) {
        case 'speech': return { color: colors.speech };
        case 'action': return { color: colors.action, fontStyle: 'italic' };
        case 'emphasis': return { color: colors.emphasis, fontWeight: 600 };
        case 'parenthetical': return { color: colors.parenthetical, fontStyle: 'italic' };
      }
    }
    // default: keep original Tailwind classes
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
    <span className={className}>
      {segments.map((segment, index) => {
        return (
          <span key={index} className={segmentClass(segment.type)} style={segmentStyle(segment.type)}>
            {segment.type === 'speech' ? '"' : segment.type === 'action' ? '*' : segment.type === 'emphasis' ? '_' : segment.type === 'parenthetical' ? '(' : ''}
            {segment.content}
            {segment.type === 'speech' ? '"' : segment.type === 'action' ? '*' : segment.type === 'emphasis' ? '_' : segment.type === 'parenthetical' ? ')' : ''}
          </span>
        );
      })}
    </span>
  );
}