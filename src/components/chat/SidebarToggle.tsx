import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  Menu, 
  Brain,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface SidebarToggleProps {
  currentView: 'navigation' | 'context';
  onToggle: (view: 'navigation' | 'context') => void;
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  hasContextData?: boolean;
}

export const SidebarToggle = ({ 
  currentView, 
  onToggle, 
  isCollapsed = false, 
  onCollapseToggle,
  hasContextData = false 
}: SidebarToggleProps) => {
  if (isCollapsed) {
    return (
      <div className="fixed left-0 top-1/2 -translate-y-1/2 z-50">
        <div className="bg-[#1a1a2e] border border-gray-700/50 rounded-r-lg shadow-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCollapseToggle}
            className="p-3 text-gray-400 hover:text-white hover:bg-gray-800/50"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute -right-12 top-1/2 -translate-y-1/2 z-50">
      <div className="bg-[#1a1a2e] border border-gray-700/50 rounded-lg shadow-lg overflow-hidden">
        {/* Toggle between views */}
        <div className="flex flex-col">
          <Button
            variant={currentView === 'navigation' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onToggle('navigation')}
            className={`p-3 rounded-none border-none ${
              currentView === 'navigation' 
                ? 'bg-[#FF7A00] text-white hover:bg-[#FF7A00]/90' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
            title="Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </Button>
          
          <div className="w-full h-px bg-gray-700/50" />
          
          <Button
            variant={currentView === 'context' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onToggle('context')}
            className={`p-3 rounded-none border-none relative ${
              currentView === 'context' 
                ? 'bg-[#FF7A00] text-white hover:bg-[#FF7A00]/90' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
            title="Character Context"
          >
            <Brain className="w-4 h-4" />
            {hasContextData && currentView !== 'context' && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF7A00] rounded-full animate-pulse" />
            )}
          </Button>
        </div>
        
        {/* Collapse toggle */}
        <div className="border-t border-gray-700/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCollapseToggle}
            className="p-3 rounded-none text-gray-400 hover:text-white hover:bg-gray-800/50 w-full"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
