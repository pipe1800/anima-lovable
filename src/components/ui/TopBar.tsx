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
        {/* Unified responsive header */}
        <div className="py-4 md:py-6">
          <div className="flex items-center justify-between gap-4">
            {/* Left section with optional left content and title */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {leftContent}
              
              <div className="min-w-0 flex-1">
                <h1 className="text-lg md:text-2xl font-bold text-white truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-xs md:text-sm text-gray-400 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Right content */}
            {rightContent && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {rightContent}
              </div>
            )}
          </div>

          {/* Custom content below header */}
          {children && (
            <div className="mt-4">
              {children}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
