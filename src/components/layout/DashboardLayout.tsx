import React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import AppSidebar from '@/components/dashboard/AppSidebar';
import { MobileHeader } from './MobileHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardData } from '@/hooks/useDashboard';
import { useLocation } from 'react-router-dom';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, profile } = useAuth();
  const { data: dashboardData } = useDashboardData();
  const location = useLocation();
  
  const userCredits = dashboardData?.credits || 0;
  const username = profile?.username || user?.email?.split('@')[0] || 'User';
  
  // Get page title based on current route
  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/dashboard': return 'Dashboard';
      case '/discover': return 'Discover';
      case '/character-creator': return 'Create Character';
      case '/profile': return 'Profile';
      case '/settings': return 'Settings';
      case '/subscription': return 'Subscription';
      case '/world-info': return 'World Infos';
      case '/moderation': return 'Moderation';
      case '/guidelines': return 'Guidelines';
      default: 
        if (pathname.startsWith('/character/')) return 'Character';
        if (pathname.startsWith('/world-info-editor')) return 'World Info Editor';
        if (pathname.startsWith('/profile/')) return 'Profile';
        return 'ANIMA';
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full bg-[#121212]">
        {/* Mobile Header - only visible on mobile */}
        <MobileHeader 
          title={getPageTitle(location.pathname)}
          userCredits={userCredits}
          username={username}
        />
        
        <div className="flex flex-1">
          {/* Desktop Sidebar */}
          <div className="hidden md:block">
            <AppSidebar />
          </div>
          
          {/* Main Content */}
          <main className="flex-1 overflow-auto md:ml-64">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};