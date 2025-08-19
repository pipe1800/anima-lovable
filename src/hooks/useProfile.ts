import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'
import { getPublicProfile, updateProfile } from '@/lib/supabase-queries'
import { useAuth } from '@/contexts/AuthContext'
import { useUserProfile, useBootstrap, useSubscriptionInfo } from '@/state/bootstrap-store'
import type { Profile } from '@/types/database'

export const useProfile = (userId?: string) => {
  const { user: currentUser } = useAuth();
  const { profile: ownProfile } = useUserProfile();
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        setError(null)
        if (!userId) { setProfile(null); return }
        const isOwnProfile = currentUser?.id === userId
        if (isOwnProfile) {
          setProfile(ownProfile as any || null);
        } else {
          const { data, error } = await getPublicProfile(userId)
          if (error) throw error
          setProfile(data as Profile)
        }
      } catch (err) {
        console.error('Error fetching profile:', err)
        setError(err as Error)
      } finally { setLoading(false) }
    }
    fetchProfile()
  }, [userId, currentUser?.id, ownProfile?.id, ownProfile?.username])

  const refetch = async () => {
    if (!userId) return
    try {
      setLoading(true); setError(null)
      const isOwnProfile = currentUser?.id === userId
      if (isOwnProfile) {
        setProfile(ownProfile as any || null); setLoading(false); return;
      }
      const { data, error } = await getPublicProfile(userId)
      if (error) throw error
      setProfile(data as Profile)
    } catch (err) { console.error('Error fetching profile:', err); setError(err as Error) } finally { setLoading(false) }
  }

  return { profile, loading, error, refetch }
}

// Use the global auth context instead of local state management
export const useCurrentUser = () => {
  const { user, profile, loading } = useAuth()
  
  return { 
    user, 
    profile, 
    loading 
  }
}

// Remove useCurrentUserOptimized in favor of bootstrap store
export const useCurrentUserOptimized = () => {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  return { data: user ? { user, profile } : null, isLoading: !profile && !!user } as any;
};

// Profile stats query
export const useProfileStats = () => {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { stats, credits } = useBootstrap();
  return {
    characterCount: stats.total_characters,
    chatCount: stats.total_chats,
    creditsBalance: credits?.balance || 0,
    followersCount: 0,
    loading: !profile && !!user
  } as any;
};

// Profile update mutation
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (updates: { username?: string; bio?: string; avatar_url?: string }) => {
      if (!user) throw new Error('No authenticated user');
      return updateProfile(user.id, updates);
    },
    onSuccess: () => {
      // Invalidate and refetch profile data
      queryClient.invalidateQueries({ queryKey: ['current-user', user?.id] });
    },
  });
};

// Remove useUserSubscription (bootstrap handles it)
export const useUserSubscription = () => {
  const { subscription } = useSubscriptionInfo();
  return { subscription } as any;
};

export const useAvailablePlans = () => {
  return useQuery({
    queryKey: ['available-plans'],
    queryFn: async () => {
      const { data: plans, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true });

      if (error) {
        throw new Error('Failed to fetch plans');
      }

      return plans || [];
    },
    staleTime: 1000 * 60 * 30, // 30 minutes (plans rarely change)
    gcTime: 1000 * 60 * 60, // 1 hour
  });
};
