
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getPrivateProfile, getUserActiveSubscription } from '@/lib/supabase-queries';
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

  const refreshSubscription = async (retryCount = 0) => {
    if (!user) {
      setSubscription(null);
      return;
    }

    try {
      console.log(`🔄 Fetching subscription for user ${user.id} (attempt ${retryCount + 1})`);
      const { data, error } = await getUserActiveSubscription(user.id);
      
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
      
      console.log('✅ Subscription loaded successfully:', data);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
