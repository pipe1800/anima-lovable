import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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

  // Dedup helpers
  const currentUserIdRef = useRef<string | null>(null);
  const prevUserIdEffectRef = useRef<string | null>(null);
  const subInFlightRef = useRef<Promise<void> | null>(null);
  const lastSubFetchAtRef = useRef<number>(0);
  const profileInFlightRef = useRef<Promise<void> | null>(null);
  const timezoneLoggedRef = useRef<boolean>(false);

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    if (profileInFlightRef.current) return; // prevent concurrent

    const p = (async () => {
      try {
        const { data } = await getPrivateProfile(user.id);
        let current = data || null;
        setProfile(current);

        // If no avatar is set, upload and assign the default avatar once
        if (current && !current.avatar_url) {
          try {
            const response = await fetch('/default_avatar.jpg');
            const blob = await response.blob();
            const file = new File([blob], 'default_avatar.jpg', { type: blob.type });
            const storagePath = `${user.id}/avatar-default.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('character-avatars')
              .upload(storagePath, file, { upsert: true });

            let avatarUrlToSet: string = '/default_avatar.jpg';
            if (!uploadError && uploadData?.path) {
              const { data: pub } = await supabase.storage
                .from('character-avatars')
                .getPublicUrl(uploadData.path);
              avatarUrlToSet = pub.publicUrl || avatarUrlToSet;
            }

            await supabase
              .from('profiles')
              .update({ avatar_url: avatarUrlToSet })
              .eq('id', user.id);

            // Update local state
            setProfile(prev => prev ? { ...prev, avatar_url: avatarUrlToSet } as Profile : prev);
          } catch (e) {
            console.error('Failed to ensure default avatar on profile refresh:', e);
          }
        }
      } catch (error) {
        console.error('Profile fetch failed:', error);
        setProfile(null);
      } finally {
        profileInFlightRef.current = null;
      }
    })();
    profileInFlightRef.current = p;
    await p;
  };

  const updateTimezoneIfNeeded = async () => {
    if (!user?.id || !profile) return;
    const browserTimezone = getBrowserTimezone();
    if (!timezoneLoggedRef.current) {
      console.debug('🌍 Detected browser timezone:', browserTimezone);
      timezoneLoggedRef.current = true;
    }

    if (profile.timezone !== browserTimezone) {
      console.debug('🔄 Updating user timezone from', profile.timezone, 'to', browserTimezone);
      const success = await updateUserTimezone(user.id, browserTimezone);
      if (success) {
        setProfile(prev => prev ? { ...prev, timezone: browserTimezone } : null);
        console.debug('✅ User timezone updated successfully');
      }
    }
  };

  const refreshSubscription = async (retryCount = 0) => {
    if (!user) {
      setSubscription(null);
      return;
    }

    // Throttle duplicate fetches for same user within 2s and prevent concurrency
    const now = Date.now();
    if (subInFlightRef.current) return await subInFlightRef.current;
    if (now - lastSubFetchAtRef.current < 2000) return;

    const p = (async () => {
      try {
        console.debug(`🔄 Fetching subscription for user ${user.id} (attempt ${retryCount + 1})`);
        const { data, error } = await supabase
          .from('subscriptions')
          .select(`*, plan:plans(*)`)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('❌ Subscription fetch failed:', error);
          if (retryCount < 3 && !error.message?.includes('JWT')) {
            const delay = Math.pow(2, retryCount) * 1000;
            console.debug(`⏳ Retrying subscription fetch in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
            subInFlightRef.current = null;
            lastSubFetchAtRef.current = Date.now();
            return refreshSubscription(retryCount + 1);
          }
          console.debug('🚫 All subscription fetch retries failed, defaulting to Guest Pass');
          setSubscription(null);
          return;
        }

        console.debug('✅ Subscription fetched successfully:', data);
        setSubscription(data || null);
      } catch (error) {
        console.error('❌ Subscription fetch exception:', error);
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.debug(`⏳ Retrying subscription fetch in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
          subInFlightRef.current = null;
          lastSubFetchAtRef.current = Date.now();
          return refreshSubscription(retryCount + 1);
        }
        setSubscription(null);
      } finally {
        lastSubFetchAtRef.current = Date.now();
        subInFlightRef.current = null;
      }
    })();

    subInFlightRef.current = p;
    await p;
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
      const newUser = session?.user ?? null;
      // Only update if changed
      if (newUser?.id !== currentUserIdRef.current) {
        setSession(session);
        setUser(newUser);
        currentUserIdRef.current = newUser?.id || null;
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('Auth state change:', event, session?.user?.id);
      const newUser = session?.user ?? null;

      // Ignore duplicate events for same user id
      if (newUser?.id === currentUserIdRef.current) {
        // Still refresh session reference silently
        setSession(session);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(newUser);
      currentUserIdRef.current = newUser?.id || null;
      setLoading(false);
    });

    // Token refresh monitor
    const refreshInterval = setInterval(async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        const expiresAt = currentSession.expires_at;
        const currentTime = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt ? expiresAt - currentTime : 0;
        if (timeUntilExpiry > 0 && timeUntilExpiry < 600) {
          console.debug('Proactively refreshing token...');
          await supabase.auth.refreshSession();
        }
      }
    }, 5 * 60 * 1000);

    return () => {
      authSub.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  // Fetch profile and subscription when user changes (dedup by user id)
  useEffect(() => {
    const id = user?.id || null;
    if (!id) {
      setProfile(null);
      setSubscription(null);
      prevUserIdEffectRef.current = null;
      return;
    }
    if (prevUserIdEffectRef.current === id) return; // no-op if same id
    prevUserIdEffectRef.current = id;

    (async () => {
      await refreshProfile();
      await refreshSubscription();
    })();
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
