import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Users, MessageSquare, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth, useBillingCredits } from '@/contexts/AuthContext';
import { supabase } from '@/db/client';
import { getUserDashboardOverview } from '@/data/dashboard/queries';
import type { Database } from '@/integrations/supabase/types';

export const ProfileStats = () => {
  const { user } = useAuth();
  const { balance } = useBillingCredits();
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['profile-stats-overview', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No authenticated user');
      const { data, error } = await getUserDashboardOverview(
        supabase as SupabaseClient<Database, '__InternalSupabase'>,
        user.id,
      );
      if (error) throw error;
      const counts = data?.counts || { chats: 0, characters: 0, favorites: 0, personas: 0 };
      return {
        characterCount: counts.characters || 0,
        chatCount: counts.chats || 0,
        favoritesCount: counts.favorites || 0,
        personaCount: counts.personas || 0,
      };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-[#1a1a2e] border-gray-700/50">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-700 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Characters Created',
      value: statsData?.characterCount || 0,
      icon: Users,
      color: 'text-[#FF7A00]'
    },
    {
      title: 'Total Conversations',
      value: statsData?.chatCount || 0,
      icon: MessageSquare,
      color: 'text-blue-400'
    },
    {
      title: 'Credits Balance',
      value: balance || 0,
      icon: Zap,
      color: 'text-yellow-400'
    },
    {
      title: 'Favorites',
      value: statsData?.favoritesCount || 0,
      icon: Heart,
      color: 'text-rose-400'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statCards.map((stat, index) => (
        <Card key={index} className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {stat.value.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
