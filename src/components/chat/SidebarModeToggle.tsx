import React from 'react';
import { Badge } from '@/components/ui/badge';

export interface SidebarModeToggleProps {
  isCollapsed: boolean;
  activeMode: 'navigation' | 'context';
  onSelect: (mode: 'navigation' | 'context') => void;
  contextCount?: number;
  className?: string;
}

/**
 * Standardized Menu / Context toggle used by both AppSidebar and ContextSidebar.
 */
export const SidebarModeToggle: React.FC<SidebarModeToggleProps> = ({
  isCollapsed,
  activeMode,
  onSelect,
  contextCount = 0,
  className = ''
}) => {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className={`flex ${isCollapsed ? 'flex-col space-y-1' : 'space-x-1'} bg-gray-800/60 rounded-full p-1 items-center transition-all`}>
        <button
          onClick={() => activeMode !== 'navigation' && onSelect('navigation')}
          className={`relative rounded-full px-3 h-8 text-xs font-medium flex items-center gap-1 transition-colors ${
            activeMode === 'navigation'
              ? 'bg-[#FF7A00] text-white shadow'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          } ${isCollapsed ? 'w-8 justify-center px-0' : ''}`}
        >
          <span className="leading-none">Menu</span>
        </button>
        <button
          onClick={() => activeMode !== 'context' && onSelect('context')}
          className={`relative rounded-full px-3 h-8 text-xs font-medium flex items-center gap-1 transition-colors ${
            activeMode === 'context'
              ? 'bg-[#FF7A00] text-white shadow'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          } ${isCollapsed ? 'w-8 justify-center px-0' : ''}`}
        >
          <span className="leading-none">Context</span>
          {contextCount > 0 && !isCollapsed && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-black/20 text-white border-none">
              {contextCount}
            </Badge>
          )}
          {contextCount > 0 && isCollapsed && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#FF7A00] rounded-full text-[9px] flex items-center justify-center font-bold text-white">
              {Math.min(contextCount, 9)}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
