
import React from 'react';
import { 
  BarChart3, 
  List, 
  Users, 
  BookOpen, 
  Shield,
  AlertTriangle,
  Eye
} from 'lucide-react';

interface ModerationSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const navigationItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    description: 'Overview & metrics'
  },
  {
    id: 'content-queue',
    label: 'Content Queue',
    icon: List,
    description: 'Pending reviews',
    badge: 12
  },
  {
    id: 'user-management',
    label: 'User Management',
    icon: Users,
    description: 'User actions & reports'
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: BookOpen,
    description: 'Moderation policies'
  }
];

export const ModerationSidebar = ({ activeSection, onSectionChange }: ModerationSidebarProps) => {
  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-[#1A1D23] border-r border-gray-700/50 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FF7A00] rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Moderation</h1>
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400">High Priority</span>
            </div>
            <p className="text-lg font-bold text-red-400 mt-1">3</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-blue-400">Under Review</span>
            </div>
            <p className="text-lg font-bold text-blue-400 mt-1">15</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                  isActive
                    ? 'bg-[#FF7A00]/10 border border-[#FF7A00]/20 text-[#FF7A00]'
                    : 'text-gray-300 hover:bg-gray-700/30 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.label}</p>
                  <p className="text-xs text-gray-500 truncate">{item.description}</p>
                </div>
                {item.badge && (
                  <div className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                    {item.badge}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700/50">
        <div className="text-xs text-gray-500">
          <p>System Status: <span className="text-green-400">Online</span></p>
          <p>Last Updated: 2 min ago</p>
        </div>
      </div>
    </div>
  );
};
