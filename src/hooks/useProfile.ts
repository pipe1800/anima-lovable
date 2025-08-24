import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/db/client'
import { Profile as ProfileQueries, Billing as BillingQueries, Auth } from '@/data'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile } from '@/types/database'

export const useProfile = (userId?: string) => {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        setError(null)

        if (!userId) {
          setProfile(null)
          return
        }

        // Get current auth user (non-throwing)
        const { user } = await Auth.getAuthUser();
        const isOwnProfile = user?.id === userId

        // Prefer unified overview RPC to minimize calls
        try {
          if (isOwnProfile) {
            const { data: bootstrap, error: bootErr } = await ProfileQueries.getUserBootstrap(userId);
            if (!bootErr && bootstrap?.profile) {
              setProfile(bootstrap.profile as Profile);
              return;
            }
          } else {
            const { data: pub, error: pubErr } = await ProfileQueries.getPublicProfileOverview(userId);
            if (!pubErr && pub?.profile) {
              setProfile(pub.profile as Profile);
              return;
            }
          }
        } catch { /* fallback below */ }

        // Use appropriate query based on whether it's the user's own profile
        const { data, error } = isOwnProfile 
          ? await ProfileQueries.getPrivateProfile(userId)
          : await ProfileQueries.getPublicProfile(userId)

        if (error) throw error
        
        setProfile(data as Profile)
      } catch (err) {
        console.error('Error fetching profile:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [userId])

  const refetch = async () => {
    if (!userId) return
    
    try {
      setLoading(true)
      setError(null)

      const { user } = await Auth.getAuthUser();
      const isOwnProfile = user?.id === userId

      try {
        if (isOwnProfile) {
          const { data: bootstrap, error: bootErr } = await ProfileQueries.getUserBootstrap(userId);
          if (!bootErr && bootstrap?.profile) { setProfile(bootstrap.profile as Profile); return }
        } else {
          const { data: pub, error: pubErr } = await ProfileQueries.getPublicProfileOverview(userId);
          if (!pubErr && pub?.profile) { setProfile(pub.profile as Profile); return }
        }
      } catch { /* fallback */ }

      const { data, error } = isOwnProfile 
        ? await ProfileQueries.getPrivateProfile(userId)
        : await ProfileQueries.getPublicProfile(userId)

      if (error) throw error
      setProfile(data as Profile)
    } catch (err) {
      console.error('Error fetching profile:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
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

// Enhanced user profile query with comprehensive data (React Query version)
export const useCurrentUserOptimized = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['current-user', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No authenticated user');
      
      const { data: profile, error } = await ProfileQueries.getPrivateProfile(user.id);

      if (error) {
        throw new Error('Failed to fetch profile');
      }

      return { user, profile };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

// Profile stats query
export const useProfileStats = () => {
  // Uses unified user bootstrap RPC now
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile-stats', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No authenticated user');
      const { data, error } = await ProfileQueries.getUserBootstrap(user.id);
      if (error) throw error;
      const counts = (data as any)?.counts || { chats:0, characters:0, favorites:0, personas:0 };
      return {
        characterCount: counts.characters,
        chatCount: counts.chats,
        creditsBalance: (data as any)?.credits ?? 0,
        followersCount: 0,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
  });
};

// Profile update mutation
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (updates: { username?: string; bio?: string; avatar_url?: string }) => {
      if (!user) throw new Error('No authenticated user');
      return ProfileQueries.updateProfile(user.id, updates);
    },
    onSuccess: () => {
      // Invalidate and refetch profile data
      queryClient.invalidateQueries({ queryKey: ['current-user', user?.id] });
    },
  });
};

// Settings-related queries
export const useUserSubscription = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-subscription', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No authenticated user');
      const { data, error } = await BillingQueries.getUserSubscription(supabase as any, user.id);
      if (error) throw new Error('Failed to fetch subscription');
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
  });
};

export const useAvailablePlans = () => {
  return useQuery({
    queryKey: ['available-plans'],
    queryFn: async () => {
      const { data, error } = await BillingQueries.getSubscriptionPlans(supabase as any);
      if (error) {
        throw new Error('Failed to fetch plans');
      }
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
};
