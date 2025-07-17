
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'
import { getPublicProfile, getPrivateProfile, updateProfile } from '@/lib/supabase-queries'
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

        // Get current user to determine if this is their own profile
        const { data: { user } } = await supabase.auth.getUser()
        const isOwnProfile = user?.id === userId

        // Use appropriate query based on whether it's the user's own profile
        const { data, error } = isOwnProfile 
          ? await getPrivateProfile(userId)
          : await getPublicProfile(userId)

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

      const { data: { user } } = await supabase.auth.getUser()
      const isOwnProfile = user?.id === userId

      const { data, error } = isOwnProfile 
        ? await getPrivateProfile(userId)
        : await getPublicProfile(userId)

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
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

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
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['profile-stats', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No authenticated user');
      
      // Get character count
      const { count: characterCount } = await supabase
        .from('characters')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id);

      // Get total chat count  
      const { count: chatCount } = await supabase
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Get credits balance
      const { data: credits } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      return {
        characterCount: characterCount || 0,
        chatCount: chatCount || 0,
        creditsBalance: credits?.balance || 0,
        followersCount: 0, // TODO: Implement when followers system is ready
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
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

// Settings-related queries
export const useUserSubscription = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-subscription', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No authenticated user');
      
      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          plans(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error('Failed to fetch subscription');
      }

      return subscription;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });
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
