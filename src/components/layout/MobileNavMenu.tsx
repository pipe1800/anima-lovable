import React from 'react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Menu, Home, Compass, MessageSquare, User, Settings, Crown, Zap, Users, Plus, LogOut, Star, ChevronLeft } from 'lucide-react';
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
  const lockedByTutorialRef = React.useRef(false);

  React.useEffect(() => {
    const onOpen = () => {
      lockedByTutorialRef.current = true;
      setOpen(true);
    };
    const onUnlock = () => {
      lockedByTutorialRef.current = false;
    };
    window.addEventListener('tutorial:mobileNav:open', onOpen as EventListener);
    window.addEventListener('tutorial:mobileNav:unlock', onUnlock as EventListener);
    return () => {
      window.removeEventListener('tutorial:mobileNav:open', onOpen as EventListener);
      window.removeEventListener('tutorial:mobileNav:unlock', onUnlock as EventListener);
    };
  }, []);

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
      <Sheet open={open} onOpenChange={(next) => {
        // Ignore attempts to close when locked by the tutorial
        if (lockedByTutorialRef.current && !next) return;
        setOpen(next);
      }}>
        <SheetTrigger asChild>
          <Button 
            data-tutorial="sidebar-trigger" 
            variant="ghost" 
            aria-label="Open navigation menu"
            className="md:hidden text-white hover:bg-gray-700 p-2 rounded-lg"
          >
            <Menu className="w-10 h-10" strokeWidth={2.5} />
          </Button>
        </SheetTrigger>
      <SheetContent side="left" className="w-2/3 md:w-80 bg-[#1a1a2e] border-gray-700 p-0 [&>button]:hidden" data-tutorial="mobile-nav-sheet">
        {/* A11y: Provide title and description for the dialog */}
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription className="sr-only">Choose a destination from the list of links.</SheetDescription>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-700 relative bg-[#1a1a2e]">
            <div className="flex items-center justify-center">
              <img 
                src={LOGO_URL} 
                alt="Anima AI Chat" 
                className="h-16 w-auto"
                loading="eager"
                style={{ imageRendering: 'crisp-edges' }}
              />
            </div>
            
            {/* Toggle button - matching desktop style */}
            <button
              onClick={() => { if (lockedByTutorialRef.current) return; setOpen(false); }}
              className="absolute -right-3 top-1/2 -translate-y-1/2 bg-[#1a1a2e] border border-gray-700 rounded-full p-1 hover:bg-[#FF7A00]/20 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-4 py-6">
            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const IconComponent = item.icon;
                const tutorialAttr =
                  item.title === 'Create Character'
                    ? 'create-character-nav'
                    : item.title === 'Discover'
                    ? 'discover-nav'
                    : item.title === 'World Info'
                    ? 'world-info-nav'
                    : undefined;
                return (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    onClick={(e) => handleNavClick(e, item.url)}
                    data-tutorial={tutorialAttr}
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
          <div className="p-4 border-t border-gray-700 space-y-4 bg-[#1a1a2e]">
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
    </div>
  );
};