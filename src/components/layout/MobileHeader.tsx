import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileNavMenu } from './MobileNavMenu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';

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
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const handleAvatarClick = () => {
    navigate(`/profile/${profile?.username || username}`);
  };
  return (
    <header className={`md:hidden p-3 sm:p-4 select-none ${className}`}>
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
        
        {/* Right: User Avatar */}
        <div className="flex-shrink-0">
          <Avatar 
            className="w-8 h-8 sm:w-10 sm:h-10 cursor-pointer ring-2 ring-transparent hover:ring-[#FF7A00]/50 transition-all"
            onClick={handleAvatarClick}
          >
            <AvatarImage 
              src={profile?.avatar_url} 
              alt={profile?.username || username} 
            />
            <AvatarFallback className="bg-[#FF7A00] text-white text-xs sm:text-sm">
              {(profile?.username || username).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
};