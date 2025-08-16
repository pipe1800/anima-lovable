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
    // Navigate to own profile without appending username to the URL
    navigate('/profile');
  };
  return (
    <header className={`md:hidden p-3 sm:p-4 select-none ${className} w-full overflow-hidden`}>
      <div className="flex items-center justify-between w-full overflow-hidden">
        {/* Left: Mobile Menu */}
        <div className="flex-shrink-0">
          <MobileNavMenu 
            userCredits={userCredits} 
            username={username}
            pageTitle={title}
            showFavoriteIcon={showFavoriteIcon}
          />
        </div>
        {/* Center: Replace title with logo on mobile */}
        <div className="flex-1 px-2 sm:px-4 min-w-0 flex items-center justify-center">
          <img 
            src="/assets/logo.png" 
            alt="Anima" 
            className="h-12 sm:h-7 w-auto pointer-events-none select-none" 
            draggable={false}
          />
          {/* Keep original title for screen readers only */}
          <span className="sr-only">{title}</span>
        </div>
        {/* Right: User Avatar */}
        <div className="flex-shrink-0">
          <Avatar 
            className="w-8 h-8 sm:w-10 sm:h-10 cursor-pointer ring-2 ring-transparent hover:ring-[#FF7A00]/50 transition-all"
            onClick={handleAvatarClick}
          >
            <AvatarImage 
              src={profile?.avatar_url || '/default_avatar.jpg'} 
              alt={profile?.username || username} 
              className="object-cover"
            />
            <AvatarFallback className="bg-[#FF7A00] text-white text-sm sm:text-base">
              {(profile?.username || username).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
};