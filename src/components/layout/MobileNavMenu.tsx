import React from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Menu, Home, Compass, MessageSquare, User, Settings, Crown, Zap, Users, Plus, LogOut, Star } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { NSFWToggle } from '@/components/NSFWToggle';

const LOGO_URL = '/assets/logo.png';
// Preload the logo image
const logoImg = new Image();
logoImg.src = LOGO_URL;

interface MobileNavMenuProps {
  userCredits?: number;
  username?: string;
  pageTitle?: string;
  showFavoriteIcon?: boolean;
  onNavigate?: (destination: string) => void;
}

export const MobileNavMenu = ({ userCredits = 0, username = 'User', pageTitle, showFavoriteIcon = true, onNavigate }: MobileNavMenuProps) => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
    setOpen(false);
  };

  const navigationItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home },
    { title: "Create Character", url: "/character-creator", icon: Plus },
    { title: "Discover", url: "/discover", icon: Compass },
    { title: "World Info", url: "/world-info", icon: Users },
    { title: "Profile", url: "/profile", icon: User },
    { title: "Subscription", url: "/subscription", icon: Crown },
  ];

  const handleNavClick = (event?: React.MouseEvent, url?: string) => {
    if (onNavigate && url) {
      event?.preventDefault();
      onNavigate(url);
    }
    setOpen(false);
  };

  return (
    <div className="flex items-center space-x-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            data-tutorial="sidebar-trigger" 
            variant="ghost" 
            size="icon" 
            className="md:hidden text-white hover:bg-gray-700 p-2"
          >
            <Menu className="h-7 w-7" />
          </Button>
        </SheetTrigger>
      <SheetContent side="left" className="w-80 bg-[#121212] border-gray-700 p-0">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-700">
            <div className="flex items-center justify-center mb-4">
              <img 
                src={LOGO_URL} 
                alt="Anima AI Chat" 
                className="h-16 w-auto"
                loading="eager"
                style={{ imageRendering: 'crisp-edges' }}
              />
            </div>
            <div className="flex items-center space-x-3">
              <Avatar className="w-12 h-12 ring-2 ring-[#FF7A00]/50">
                <AvatarImage 
                  src={profile?.avatar_url || "https://images.unsplash.com/photo-1649972904349-6e44c42644a7?w=150&h=150&fit=crop&crop=face"} 
                  alt={profile?.username || "User"} 
                />
                <AvatarFallback className="bg-[#FF7A00] text-white font-bold">
                  {profile?.username?.substring(0, 2).toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-white font-bold">@{username}</p>
                <div className="flex items-center space-x-1">
                  <Zap className="w-4 h-4 text-[#FF7A00]" />
                  <span className="text-[#FF7A00] text-sm font-bold">{userCredits.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-4 py-6">
            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    onClick={(e) => handleNavClick(e, item.url)}
                    className={({ isActive }) =>
                      `flex items-center space-x-3 w-full px-4 py-3 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-[#FF7A00] text-white'
                          : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                      }`
                    }
                  >
                    <IconComponent className="h-5 w-5" />
                    <span className="font-medium">{item.title}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700 space-y-4">
            {/* NSFW Toggle */}
            <div className="px-2">
              <NSFWToggle />
            </div>
            
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-700/50"
            >
              <LogOut className="h-5 w-5 mr-3" />
              Sign Out
            </Button>
          </div>
        </div>
        </SheetContent>
      </Sheet>
      
      {/* Favorite Icon */}
      {showFavoriteIcon && (
        <Button variant="ghost" size="icon" className="md:hidden text-white hover:bg-gray-700 p-2">
          <Star className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
};