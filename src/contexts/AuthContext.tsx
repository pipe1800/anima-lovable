import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getPrivateProfile, getUserActiveSubscription } from '@/lib/supabase-queries';
import { getBrowserTimezone, updateUserTimezone } from '@/utils/timezone';
import type { Profile, Subscription, Plan } from '@/types/database';
import { TutorialProvider } from './TutorialContext';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  subscription: any | null; // Using any for flexibility with the query result
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [subscription, setSubscription] = useState<any | null>(null); // Using any for flexibility
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    try {
      const { data } = await getPrivateProfile(user.id);
      setProfile(data || null);
    } catch (error) {
      console.error('Profile fetch failed:', error);
      setProfile(null);
    }
  };

  const updateTimezoneIfNeeded = async () => {
    if (!user?.id || !profile) return;
    
    const browserTimezone = getBrowserTimezone();
    console.log('🌍 Detected browser timezone:', browserTimezone);
    
    // Check if timezone needs updating
    if (profile.timezone !== browserTimezone) {
      console.log('🔄 Updating user timezone from', profile.timezone, 'to', browserTimezone);
      const success = await updateUserTimezone(user.id, browserTimezone);
      if (success) {
        // Update the profile state to reflect the change
        setProfile(prev => prev ? { ...prev, timezone: browserTimezone } : null);
        console.log('✅ User timezone updated successfully');
      }
    }
  };

  const refreshSubscription = async (retryCount = 0) => {
    if (!user) {
      setSubscription(null);
      return;
    }

    try {
      console.log(`🔄 Fetching subscription for user ${user.id} (attempt ${retryCount + 1})`);
      
      // Use the more general getUserSubscription instead of getUserActiveSubscription
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          plan:plans(*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('❌ Subscription fetch failed:', error);
        
        // Retry logic with exponential backoff for non-critical errors
        if (retryCount < 3 && !error.message?.includes('JWT')) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          console.log(`⏳ Retrying subscription fetch in ${delay}ms...`);
          setTimeout(() => refreshSubscription(retryCount + 1), delay);
          return;
        }
        
        // Only set to null after all retries failed
        console.log('🚫 All subscription fetch retries failed, defaulting to Guest Pass');
        setSubscription(null);
        return;
      }
      
      console.log('✅ Subscription fetched successfully:', data);
      setSubscription(data || null);
    } catch (error) {
      console.error('❌ Subscription fetch exception:', error);
      
      // Retry for network errors
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Retrying subscription fetch in ${delay}ms...`);
        setTimeout(() => refreshSubscription(retryCount + 1), delay);
        return;
      }
      
      setSubscription(null);
    }
  };

  const signOut = async () => {
    try {
      // Clear local state first
      setUser(null);
      setProfile(null);
      setSession(null);
      setSubscription(null);
      
      // Attempt to sign out from Supabase
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      // Don't throw error if session is already invalid
      if (error && !error.message?.includes('session_not_found') && !error.message?.includes('Session not found')) {
        console.error('Sign out error:', error);
        throw error;
      }
      
      // Clear any additional local storage that might be cached
      localStorage.removeItem('supabase.auth.token');
      
    } catch (error) {
      console.error('Error during sign out:', error);
      // Even if sign out fails, clear local state
      setUser(null);
      setProfile(null);
      setSession(null);
      setSubscription(null);
      throw error;
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.id);
      
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Handle session refresh
      if (event === 'TOKEN_REFRESHED') {
      }
      
      // Handle auth errors
      if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        // Clear any cached data if needed
      }
    });

    // Set up automatic token refresh monitoring
    const refreshInterval = setInterval(async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (currentSession) {
        const expiresAt = currentSession.expires_at;
        const currentTime = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt ? expiresAt - currentTime : 0;
        
        // Refresh if token expires in less than 10 minutes
        if (timeUntilExpiry > 0 && timeUntilExpiry < 600) {
          console.log('Proactively refreshing token...');
          await supabase.auth.refreshSession();
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  // Fetch profile and subscription when user changes
  useEffect(() => {
    if (user) {
      refreshProfile();
      refreshSubscription();
    } else {
      setProfile(null);
      setSubscription(null);
    }
  }, [user]);

  // Update timezone when profile is loaded
  useEffect(() => {
    if (user && profile) {
      updateTimezoneIfNeeded();
    }
  }, [user, profile]);

  const value = {
    user,
    profile,
    session,
    subscription,
    loading,
    signOut,
    refreshProfile,
    refreshSubscription,
  };

  return (
    <AuthContext.Provider value={value}>
      <TutorialProvider>
        {children}
      </TutorialProvider>
    </AuthContext.Provider>
  );
};
