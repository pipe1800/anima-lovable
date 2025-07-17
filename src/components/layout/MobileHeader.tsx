import React from 'react';
import { MobileNavMenu } from './MobileNavMenu';

interface MobileHeaderProps {
  title: string;
  userCredits?: number;
  username?: string;
  showFavoriteIcon?: boolean;
  className?: string;
}

export const MobileHeader = ({ 
  title, 
  userCredits = 0, 
  username = 'User', 
  showFavoriteIcon = true,
  className = "bg-[#1a1a2e] border-b border-gray-700/50"
}: MobileHeaderProps) => {
  return (
    <header className={`md:hidden p-3 sm:p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Left: Mobile Menu */}
        <div className="flex-shrink-0">
          <MobileNavMenu 
            userCredits={userCredits} 
            username={username}
            pageTitle={title}
            showFavoriteIcon={showFavoriteIcon}
          />
        </div>
        
        {/* Center: Page Title */}
        <div className="flex-1 px-4">
          <h1 className="text-white text-lg sm:text-xl font-semibold text-center truncate">
            {title}
          </h1>
        </div>
        
        {/* Right: Spacer for balance */}
        <div className="flex-shrink-0 w-16"></div>
      </div>
    </header>
  );
};