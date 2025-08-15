import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  MoreHorizontal,
  Edit,
  Share2,
  Download,
  Trash2,
  Copy
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface MobileNavigationProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  backUrl?: string;
  actions?: Array<{
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    variant?: 'default' | 'destructive';
  }>;
  className?: string;
}

export default function MobileNavigation({
  title,
  subtitle,
  showBack = true,
  backUrl,
  actions = [],
  className
}: MobileNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (backUrl) {
      navigate(backUrl);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={cn(
      "sticky top-0 z-50 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-gray-700/50 px-4 py-3",
      className
    )}>
      <div className="flex items-center justify-between">
        {/* Left side - Back button and title */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {showBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-gray-400 hover:text-white p-2 flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          
          {title && (
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-white truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-gray-400 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right side - Actions */}
        {actions.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions.length <= 2 ? (
              // Show buttons directly if 2 or fewer actions
              actions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={index}
                    variant={action.variant === 'destructive' ? 'destructive' : 'ghost'}
                    size="sm"
                    onClick={action.onClick}
                    className={cn(
                      "p-2",
                      action.variant === 'destructive' 
                        ? "text-red-400 hover:text-red-300" 
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </Button>
                );
              })
            ) : (
              // Use dropdown menu if more than 2 actions
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-gray-400 hover:text-white p-2"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="w-48 bg-[#1a1a2e] border-gray-700"
                >
                  {actions.map((action, index) => {
                    const Icon = action.icon;
                    const isDestructive = action.variant === 'destructive';
                    
                    return (
                      <React.Fragment key={index}>
                        {index > 0 && isDestructive && (
                          <DropdownMenuSeparator className="bg-gray-700" />
                        )}
                        <DropdownMenuItem 
                          onClick={action.onClick}
                          className={cn(
                            isDestructive 
                              ? "text-red-400 focus:text-red-300" 
                              : "text-white"
                          )}
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {action.label}
                        </DropdownMenuItem>
                      </React.Fragment>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Predefined action configurations for common scenarios
export const WorldInfoActions = {
  edit: (onEdit: () => void) => ({
    label: 'Edit',
    icon: Edit,
    onClick: onEdit
  }),
  
  share: (onShare: () => void) => ({
    label: 'Share',
    icon: Share2,
    onClick: onShare
  }),
  
  export: (onExport: () => void) => ({
    label: 'Export',
    icon: Download,
    onClick: onExport
  }),
  
  duplicate: (onDuplicate: () => void) => ({
    label: 'Duplicate',
    icon: Copy,
    onClick: onDuplicate
  }),
  
  delete: (onDelete: () => void) => ({
    label: 'Delete',
    icon: Trash2,
    onClick: onDelete,
    variant: 'destructive' as const
  })
};

// Breadcrumb component for mobile navigation
interface MobileBreadcrumbProps {
  items: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
  }>;
  className?: string;
}

export function MobileBreadcrumb({ items, className }: MobileBreadcrumbProps) {
  const navigate = useNavigate();

  const handleItemClick = (item: typeof items[0]) => {
    if (item.onClick) {
      item.onClick();
    } else if (item.href) {
      navigate(item.href);
    }
  };

  return (
    <div className={cn("flex items-center gap-2 text-sm overflow-x-auto", className)}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="text-gray-500 flex-shrink-0">/</span>
          )}
          
          {index === items.length - 1 ? (
            <span className="text-white font-medium truncate">
              {item.label}
            </span>
          ) : (
            <button
              onClick={() => handleItemClick(item)}
              className="text-gray-400 hover:text-white transition-colors truncate flex-shrink-0"
            >
              {item.label}
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Tab navigation component for mobile
interface MobileTabNavigationProps {
  tabs: Array<{
    id: string;
    label: string;
    icon?: React.ElementType;
    count?: number;
  }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function MobileTabNavigation({
  tabs,
  activeTab,
  onTabChange,
  className
}: MobileTabNavigationProps) {
  return (
    <div className={cn(
      "flex bg-gray-800/50 border border-gray-700 rounded-lg p-1 overflow-x-auto",
      className
    )}>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-200 whitespace-nowrap flex-shrink-0",
              isActive 
                ? "bg-[#FF7A00] text-white shadow-sm" 
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span className="text-sm font-medium">{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                isActive 
                  ? "bg-white/20 text-white" 
                  : "bg-gray-600 text-gray-300"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
