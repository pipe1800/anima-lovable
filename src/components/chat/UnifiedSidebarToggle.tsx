import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Brain, 
  Menu, 
  Activity 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface UnifiedSidebarToggleProps {
  isCollapsed: boolean;
  sidebarMode: 'navigation' | 'context';
  onToggleCollapsed: () => void;
  onToggleMode: () => void;
  contextCount?: number;
  className?: string;
}

export const UnifiedSidebarToggle: React.FC<UnifiedSidebarToggleProps> = ({
  isCollapsed,
  sidebarMode,
  onToggleCollapsed,
  onToggleMode,
  contextCount = 0,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Mode Toggle - only show when sidebar is expanded */}
      {!isCollapsed && (
        <div className="flex items-center bg-gray-800/50 rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMode}
            className={`h-7 px-2 text-xs transition-all duration-200 ${
              sidebarMode === 'navigation' 
                ? 'bg-gray-700 text-white' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <Menu className="w-3 h-3 mr-1" />
            Nav
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMode}
            className={`h-7 px-2 text-xs transition-all duration-200 relative ${
              sidebarMode === 'context' 
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <Brain className="w-3 h-3 mr-1" />
            Context
            {contextCount > 0 && (
              <Badge 
                variant="secondary" 
                className="ml-1 h-4 px-1 text-xs bg-orange-500 text-white border-none"
              >
                {contextCount}
              </Badge>
            )}
          </Button>
        </div>
      )}
      
      {/* Collapse/Expand Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleCollapsed}
        className="h-7 w-7 p-0 bg-gray-800 border border-gray-700 rounded-full hover:bg-[#FF7A00]/20 transition-all duration-200"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        )}
      </Button>
      
      {/* Context indicator when collapsed */}
      {isCollapsed && sidebarMode === 'context' && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2">
          <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full opacity-75"></div>
          {contextCount > 0 && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">{Math.min(contextCount, 9)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
