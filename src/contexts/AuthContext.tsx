import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/db/client';
import { Auth as AuthQueries } from '@/data';
import { Billing, Profile as ProfileQueries, Uploads } from '@/data';
import { getBrowserTimezone, updateUserTimezone } from '@/utils/timezone';
import type { Profile } from '@/types/database';
import { TutorialProvider } from './TutorialContext';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  subscription: any | null; // Using any for flexibility with the query result
  loading: boolean;
  authReady: boolean; // added flag
  profileReady: boolean; // new flag indicating profile has been fetched/attempted
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  supabase: typeof supabase;
}

// Live Credits Context -------------------------------------------------------
interface CreditsContextType { balance: number; refresh: () => Promise<void>; loading: boolean; }

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const BillingCreditsContext = createContext<CreditsContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useBillingCredits = () => {
  const ctx = useContext(BillingCreditsContext);
  if (!ctx) throw new Error('useBillingCredits must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [subscription, setSubscription] = useState<any | null>(null); // Using any for flexibility
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Dedup helpers
  const currentUserIdRef = useRef<string | null>(null);
  const prevUserIdEffectRef = useRef<string | null>(null);
  const subInFlightRef = useRef<Promise<void> | null>(null);
  const lastSubFetchAtRef = useRef<number>(0);
  const profileInFlightRef = useRef<Promise<void> | null>(null);
  const creditsFetchInFlightRef = useRef<Promise<void> | null>(null);
  const timezoneLoggedRef = useRef<boolean>(false);
  const profileAttemptedRef = useRef(false); // track that at least one profile fetch attempt occurred

  const ensureProfileAvatar = async (current: Profile | null) => {
    if (!user?.id || !current || current.avatar_url) return current;
    try {
      // Delegate default avatar provisioning to uploads helper
      const publicUrl = await Uploads.ensureDefaultAvatar(user.id);
      const { data, error } = await ProfileQueries.updateProfile(user.id, { avatar_url: publicUrl });
      if (!error && data) {
        return data as Profile;
      }
    } catch (e) {
      console.error('Failed to provision default avatar:', e);
    }
    return current; // fallback unchanged
  };

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    if (profileInFlightRef.current) return; // prevent concurrent

    const p = (async () => {
      try {
        const { data } = await ProfileQueries.getPrivateProfile(user.id);
        profileAttemptedRef.current = true;
        let current = data || null;
        current = await ensureProfileAvatar(current);
        setProfile(current);
      } catch (error) {
        profileAttemptedRef.current = true;
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
        console.debug(`🔄 Fetching subscription (RPC) for user ${user.id} (attempt ${retryCount + 1})`);
        const { data, error } = await Billing.getUserSubscription(supabase, user.id);

        if (error) {
          console.error('❌ Subscription fetch (RPC) failed:', error);
          if (retryCount < 3 && !(error as any)?.message?.includes('JWT')) {
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

        console.debug('✅ Subscription fetched successfully (RPC):', data);
        setSubscription(data || null);
      } catch (error) {
        console.error('❌ Subscription fetch exception (RPC):', error);
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

  const refreshCredits = async () => {
    if (!user?.id) { setCreditsBalance(0); return; }
    if (creditsFetchInFlightRef.current) return creditsFetchInFlightRef.current;
    const p = (async () => {
      try {
        const { data, error } = await Billing.getUserCredits(supabase as any, user.id);
        if (!error && data) setCreditsBalance(data.balance || 0);
      } catch (e) { /* silent */ }
      finally { creditsFetchInFlightRef.current = null; }
    })();
    creditsFetchInFlightRef.current = p;
    await p;
  };

  // Subscribe to realtime credits changes
  useEffect(() => {
    if (!user?.id) return;
    refreshCredits();
    const channel = supabase.channel(`credits-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'billing', table: 'credits', filter: `user_id=eq.${user.id}` }, () => {
        refreshCredits();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const signOut = async () => {
    try {
      // Clear local state first
      setUser(null);
      setProfile(null);
      setSession(null);
      setSubscription(null);
      const { error } = await AuthQueries.signOut();
      if (error && !error.message?.includes('session_not_found') && !error.message?.includes('Session not found')) {
        console.error('Sign out error:', error);
        throw error;
      }
      localStorage.removeItem('supabase.auth.token');
    } catch (error) {
      console.error('Error during sign out:', error);
      setUser(null);
      setProfile(null);
      setSession(null);
      setSubscription(null);
      throw error;
    }
  };

  useEffect(() => {
    AuthQueries.getSession().then(({ data: { session } }) => {
      const newUser = session?.user ?? null;
      if (newUser?.id !== currentUserIdRef.current) {
        setSession(session);
        setUser(newUser);
        currentUserIdRef.current = newUser?.id || null;
      }
      setLoading(false);
    });

    const { data: { subscription: authSub } } = AuthQueries.onAuthStateChange(async (event, session) => {
      console.debug('Auth state change:', event, session?.user?.id);
      const newUser = session?.user ?? null;
      if (newUser?.id === currentUserIdRef.current) {
        setSession(session);
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(newUser);
      currentUserIdRef.current = newUser?.id || null;
      setLoading(false);
    });

    const refreshInterval = setInterval(async () => {
      const { data: { session: currentSession } } = await AuthQueries.getSession();
      if (!currentSession) return;
      const expiresAt = currentSession.expires_at;
      const currentTime = Math.floor(Date.now() / 1000);
      if (expiresAt && currentTime >= expiresAt) {
        console.warn('Session expired – clearing auth state');
        await signOut();
        return;
      }
      const timeUntilExpiry = expiresAt ? expiresAt - currentTime : 0;
      if (timeUntilExpiry > 0 && timeUntilExpiry < 600) {
        console.debug('Proactively refreshing token...');
        await AuthQueries.getSession(); // trigger refresh via standard flow (could add explicit helper)
      }
    }, 2 * 60 * 1000);

    return () => {
      authSub.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    const id = user?.id || null;
    if (!id) {
      setProfile(null);
      setSubscription(null);
      prevUserIdEffectRef.current = null;
      return;
    }
    if (prevUserIdEffectRef.current === id) return;
    prevUserIdEffectRef.current = id;
    (async () => {
      await Promise.all([refreshProfile(), refreshSubscription()]);
    })();
  }, [user]);

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
    authReady: (!loading && (user == null || profile !== null)),
    profileReady: (!loading && (user == null || profile !== null || profileAttemptedRef.current)),
    signOut,
    refreshProfile,
    refreshSubscription,
    supabase,
  };
  const creditsCtxValue: CreditsContextType = { balance: creditsBalance, refresh: refreshCredits, loading: false };

  return (
    <AuthContext.Provider value={value}>
      <BillingCreditsContext.Provider value={creditsCtxValue}>
        <TutorialProvider>{children}</TutorialProvider>
      </BillingCreditsContext.Provider>
    </AuthContext.Provider>
  );
};

