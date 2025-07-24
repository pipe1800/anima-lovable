import React from 'react';
import { cn } from '@/lib/utils';

interface TopBarProps {
  title: string;
  subtitle?: string;
  leftContent?: React.ReactNode;   // For back buttons, mobile menu, etc.
  rightContent?: React.ReactNode;  // For action buttons
  showBorder?: boolean;
  sticky?: boolean;
  children?: React.ReactNode;      // For custom content like progress bars
  className?: string;
}

export function TopBar({
  title,
  subtitle,
  leftContent,
  rightContent,
  showBorder = true,
  sticky = true,
  children,
  className
}: TopBarProps) {
  return (
    <header className={cn(
      "bg-[#1a1a2e]",
      showBorder && "border-b border-gray-700/50",
      sticky && "sticky top-0",
      "z-30", // Lower than sidebar (z-50) to avoid overlap
      className
    )}>
      <div className="container mx-auto px-4">
        {/* Mobile Header */}
        <div className="md:hidden py-4">
          <div className="flex items-center justify-between mb-4">
            {leftContent}
            
            <div className="flex-1 text-center mx-4">
              <h1 className="text-xl font-bold text-white truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs text-gray-400 truncate">{subtitle}</p>
              )}
            </div>

            {rightContent && (
              <div className="flex items-center space-x-2">
                {rightContent}
              </div>
            )}
          </div>

          {/* Mobile custom content */}
          {children && (
            <div>
              {children}
            </div>
          )}
        </div>

        {/* Desktop Header */}
        <div className="hidden md:block py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              {leftContent}
              
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm text-gray-400">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {rightContent && (
              <div className="flex items-center space-x-4">
                {rightContent}
              </div>
            )}
          </div>

          {/* Desktop custom content */}
          {children && (
            <div>
              {children}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
