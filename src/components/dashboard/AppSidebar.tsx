
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  MessageCircle, 
  User, 
  Settings, 
  CreditCard, 
  Home,
  Plus,
  Compass,
  Users,
  Zap,
  LogOut,
  Crown,
  PowerOff,
  BookOpen
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCredits } from '@/lib/supabase-queries';
import { useUserSubscription } from '@/hooks/useProfile';

// Preload the logo image to prevent reloading
const LOGO_URL = 'https://rclpyipeytqbamiwcuih.supabase.co/storage/v1/object/sign/images/45d0ba23-cfa2-404a-8527-54e83cb321ef.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9mYmU5OTM4My0yODYxLTQ0N2UtYThmOC1hY2JjNzU3YjQ0YzgiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvNDVkMGJhMjMtY2ZhMi00MDRhLTg1MjctNTRlODNjYjMyMWVmLnBuZyIsImlhdCI6MTc1MjI1MjA4MywiZXhwIjo0OTA1ODUyMDgzfQ.OKhncau8pVPBvcnDrafnifJdihe285oi5jcpp1z3-iM';
const logoImage = new Image();
logoImage.src = LOGO_URL;

const baseMainItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Create Character", url: "/character-creator", icon: Plus },
  { title: "World Infos", url: "/world-info", icon: BookOpen, tutorialAttr: "world-info-nav" },
  { title: "Discover", url: "/discover", icon: Compass, tutorialAttr: "discover-nav" },
  { title: "Profile", url: "/profile", icon: User },
];

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut, loading } = useAuth();
  const [userCredits, setUserCredits] = useState(0);
  const currentPath = location.pathname;
  const { data: userSubscription } = useUserSubscription();

  // Memoize the logo component to prevent re-rendering
  const MemoizedLogo = useMemo(() => {
    return React.memo(() => (
      <img 
        src={LOGO_URL}
        alt="Anima AI Chat" 
        className="h-16 w-auto"
        loading="eager"
        style={{ imageRendering: 'crisp-edges' }}
      />
    ));
  }, []);

  // Create main items with dynamic subscription icon
  const mainItems = useMemo(() => {
    const hasActiveSubscription = userSubscription?.status === 'active' && userSubscription?.plans?.price_monthly > 0;
    return [
      ...baseMainItems,
      { 
        title: "Subscription", 
        url: "/subscription", 
        icon: Crown,
        isActive: hasActiveSubscription 
      },
    ];
  }, [userSubscription?.status]);

  const fetchCredits = useCallback(async () => {
    if (!user) return;
    
    try {
      const creditsResult = await getUserCredits(user.id);
      if (creditsResult.data && typeof creditsResult.data.balance === 'number') {
        setUserCredits(creditsResult.data.balance);
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const isActive = useCallback((path: string) => {
    if (path === '/profile') {
      // Keep Profile active for both /profile and /profile/settings
      return currentPath === '/profile' || currentPath.startsWith('/profile/');
    }
    if (path === '/world-info') {
      // Keep World Info active for all world-info related routes
      return currentPath === '/world-info' || 
             currentPath.startsWith('/world-info-') || 
             currentPath.startsWith('/world-info/');
    }
    return currentPath === path;
  }, [currentPath]);

  const getNavClasses = useCallback((active: boolean) => 
    `flex items-center justify-start w-full space-x-4 px-4 py-3.5 transition-all duration-200 text-base ${
      active 
        ? 'bg-[#FF7A00]/20 text-[#FF7A00] border-r-2 border-[#FF7A00]' 
        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
    }`, []);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      // Don't show error to user for logout failures - just redirect
    } finally {
      // Always navigate to home regardless of logout success/failure
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="fixed left-0 top-0 w-64 h-screen bg-[#1b1b1b] border-r border-gray-700/50 z-40">
        <div className="flex items-center justify-center h-full">
          <div className="text-white">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="fixed left-0 top-0 w-64 h-screen bg-[#1b1b1b] border-r border-gray-700/50 z-40">
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-700/50 p-4">
          {/* App Logo */}
          <div className="flex items-center justify-center px-4 py-4">
            <MemoizedLogo />
          </div>
        </div>

        <div className="px-2 py-4 flex-1">
          <div className="space-y-3">
            {mainItems.map((item) => {
              const IconComponent = item.icon;
              const isSubscriptionItem = item.title === "Subscription";
              const hasActiveSubscription = (item as any).isActive;
              
              return (
                <NavLink 
                  key={item.title}
                  to={item.url} 
                  className={getNavClasses(isActive(item.url))}
                  data-tutorial={(item as any).tutorialAttr}
                >
                  {isSubscriptionItem && hasActiveSubscription ? (
                    <Crown className="w-5 h-5 flex-shrink-0 fill-yellow-500 text-yellow-500" />
                  ) : (
                    <IconComponent className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="font-medium text-base">{item.title}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-700/50 p-4">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800/50 p-3 space-x-4"
            onClick={handleLogout}
          >
            <PowerOff className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium text-base">Logout</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AppSidebar);
