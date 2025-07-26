
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
  BookOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCredits } from '@/lib/supabase-queries';

// Preload the logo image to prevent reloading
const LOGO_URL = '/assets/logo.png';
const logoImage = new Image();
logoImage.src = LOGO_URL;

const baseMainItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Create Character", url: "/character-creator", icon: Plus, tutorialAttr: "create-character-nav" },
  { title: "Discover", url: "/discover", icon: Compass, tutorialAttr: "discover-nav" },
  { title: "World Infos", url: "/world-info", icon: BookOpen, tutorialAttr: "world-info-nav" },
  { title: "Profile", url: "/profile", icon: User },
];

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut, loading, subscription: authSubscription } = useAuth();
  const [userCredits, setUserCredits] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const currentPath = location.pathname;

  // Load collapsed state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState) {
      setIsCollapsed(JSON.parse(savedState));
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
      
      // Dispatch custom event for layout to listen
      window.dispatchEvent(new CustomEvent('sidebarToggled'));
      
      return newState;
    });
  }, []);

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
    const hasActiveSubscription = authSubscription?.status === 'active' && authSubscription?.plan?.price_monthly > 0;
    const planName = authSubscription?.plan?.name?.toLowerCase();
    
    return [
      ...baseMainItems,
      { 
        title: "Subscription", 
        url: "/subscription", 
        icon: Crown,
        isActive: hasActiveSubscription,
        planName: planName
      },
    ];
  }, [authSubscription?.status, authSubscription?.plan]);

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
    <div className={`bg-[#0f0f0f] h-full text-white flex flex-col transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      <div className="flex flex-col h-full">
        {/* Header with logo */}
        <div className="border-b border-gray-700/50 p-4 relative">
          <div className="flex items-center justify-center">
            {isCollapsed ? (
              // Show favicon when collapsed
              <img 
                src="/assets/logo_emblem.png" 
                alt="A" 
                className="h-8 w-8"
              />
            ) : (
              // Show full logo when expanded
              <MemoizedLogo />
            )}
          </div>
          
          {/* Toggle button */}
          <button
            onClick={toggleSidebar}
            className="absolute -right-3 top-1/2 -translate-y-1/2 bg-[#1a1a2e] border border-gray-700 rounded-full p-1 hover:bg-[#FF7A00]/20 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>

        {/* Navigation items */}
        <div className="px-2 py-4 flex-1">
          <div className="space-y-3">
            {mainItems.map((item) => {
              const IconComponent = item.icon;
              const isActiveItem = isActive(item.url);
              const isSubscriptionItem = item.title === "Subscription";
              const hasActiveSubscription = (item as any).isActive;
              const planName = (item as any).planName;
              
              // Determine crown icon styling
              let crownClasses = "w-5 h-5 flex-shrink-0";
              if (isSubscriptionItem && hasActiveSubscription) {
                if (planName?.includes('whale')) {
                  crownClasses += " fill-yellow-500 text-yellow-500"; // Gold filled crown for Whale
                } else if (planName?.includes('true fan')) {
                  crownClasses += " fill-gray-300 text-gray-300"; // Silver filled crown for True Fan
                } else {
                  crownClasses += " fill-current text-current"; // Default filled
                }
              }
              
              return (
                <NavLink 
                  key={item.title}
                  to={item.url}
                  className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} w-full space-x-4 px-4 py-3.5 transition-all duration-200 text-base ${
                    isActiveItem 
                      ? 'bg-[#FF7A00]/20 text-[#FF7A00] border-r-2 border-[#FF7A00]' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-800/50'
                  }`}
                  title={isCollapsed ? item.title : undefined}
                  data-tutorial={(item as any).tutorialAttr}
                >
                  {isSubscriptionItem ? (
                    <Crown className={crownClasses} />
                  ) : (
                    <IconComponent className="w-5 h-5 flex-shrink-0" />
                  )}
                  {!isCollapsed && (
                    <span className="font-medium text-base">{item.title}</span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* User section */}
        <div className="border-t border-gray-700/50 p-4">
          {!isCollapsed && profile && (
            <div className="flex items-center space-x-3 mb-4">
              <Avatar className="w-10 h-10">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback>{profile?.username?.[0] || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {profile?.username || 'User'}
                </p>
                <div className="flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-[#FF7A00]" />
                  <span className="text-xs text-[#FF7A00]">{userCredits.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
          
          <Button 
            variant="ghost" 
            className={`w-full ${isCollapsed ? 'justify-center' : 'justify-start'} text-gray-400 hover:text-white hover:bg-gray-800/50 p-3 space-x-4`}
            onClick={handleLogout}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <PowerOff className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="font-medium text-base">Logout</span>}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AppSidebar);
