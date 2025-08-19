import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserTimezone, updateUserTimezone } from '@/utils/timezone';
import type { Profile, Subscription, Plan } from '@/types/database';
import { TutorialProvider } from './TutorialContext';
import { BootstrapProvider, useUserProfile, useSubscriptionInfo, useSnapshotLoading, ensureSnapshotLoaded, bootstrapActions, bootstrapStore, fetchUserSnapshotV2 } from '@/state/bootstrap-store';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  subscription: any | null;
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
  // Auth primitives only here (no bootstrap hooks yet)
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);
  // Track provider mounted before calling ensureSnapshotLoaded
  const bootstrapReadyRef = useRef(false);

  useEffect(() => { bootstrapReadyRef.current = true; }, []);

  // Effects for auth state management (unchanged logic)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const newUser = session?.user ?? null;
      if (newUser?.id !== currentUserIdRef.current) {
        setSession(session);
        setUser(newUser);
        currentUserIdRef.current = newUser?.id || null;
        if (newUser?.id && bootstrapReadyRef.current) ensureSnapshotLoaded();
      }
      setAuthLoading(false);
    });
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null;
      if (newUser?.id !== currentUserIdRef.current) {
        setSession(session);
        setUser(newUser);
        currentUserIdRef.current = newUser?.id || null;
        if (newUser?.id && bootstrapReadyRef.current) ensureSnapshotLoaded(); else bootstrapStore.reset();
      }
      setAuthLoading(false);
    });
    return () => { authSub.unsubscribe(); };
  }, []);

  const signOut = async () => {
    try {
      bootstrapStore.reset();
      setUser(null); setSession(null);
      await supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem('supabase.auth.token');
    } catch (e) {
      console.error('Sign out error:', e);
    } finally {
      bootstrapStore.reset();
    }
  };

  // Inner bridge component that consumes bootstrap hooks WITH provider mounted
  const AuthContextBridge: React.FC = () => {
    const { profile } = useUserProfile();
    const { subscription } = useSubscriptionInfo();
    const { loading: snapshotLoading } = useSnapshotLoading();

    const loading = authLoading || (user ? snapshotLoading : false);

    const refreshProfile = async () => {
      if (!user) return;
      await ensureSnapshotLoaded(async () => await fetchUserSnapshotV2(), true as any);
    };
    const refreshSubscription = refreshProfile;

    // Timezone sync
    useEffect(() => {
      const updateTimezoneIfNeeded = async () => {
        if (!user?.id || !profile) return;
        const browserTimezone = getBrowserTimezone();
        if (profile.timezone !== browserTimezone) {
          const success = await updateUserTimezone(user.id, browserTimezone);
            if (success) bootstrapActions.setProfile({ timezone: browserTimezone });
        }
      };
      updateTimezoneIfNeeded();
    }, [profile?.timezone, user?.id]);

    const value: AuthContextType = { user, profile: profile as any, session, subscription, loading, signOut, refreshProfile, refreshSubscription };
    return (
      <AuthContext.Provider value={value}>
        <TutorialProvider>{children}</TutorialProvider>
      </AuthContext.Provider>
    );
  };

  return (
    <BootstrapProvider userId={user?.id || null}>
      <AuthContextBridge />
    </BootstrapProvider>
  );
};
