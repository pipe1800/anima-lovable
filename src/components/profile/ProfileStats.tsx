import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, MessageSquare, Zap, Heart, Sparkles } from 'lucide-react';
import { useStats, useCredits } from '@/state/bootstrap-store';

interface ProvidedStats {
  totalChats: number;
  totalCharacters: number;
  totalFavorites: number;
  totalPersonas: number;
  creditsBalance?: number;
}

interface ProfileStatsProps {
  stats?: ProvidedStats; // optional externally provided stats (e.g. public profile view)
  loading?: boolean;
  showFollowers?: boolean; // future extension
}

export const ProfileStats: React.FC<ProfileStatsProps> = ({ stats: external, loading = false }) => {
  const storeStats = useStats();
  const { balance } = useCredits();
  const stats = external ? external : {
    totalChats: storeStats.total_chats,
    totalCharacters: storeStats.total_characters,
    totalFavorites: storeStats.total_favorites,
    totalPersonas: storeStats.total_personas,
    creditsBalance: balance,
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-6 animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-8 bg-muted rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Chats',
      value: stats.totalChats || 0,
      icon: MessageSquare,
      color: 'text-blue-400'
    },
    {
      title: 'Characters',
      value: stats.totalCharacters || 0,
      icon: Sparkles,
      color: 'text-purple-400'
    },
    {
      title: 'Favorites',
      value: stats.totalFavorites || 0,
      icon: Heart,
      color: 'text-red-400'
    },
    {
      title: 'Personas',
      value: stats.totalPersonas || 0,
      icon: Users,
      color: 'text-green-400'
    },
    {
      title: 'Credits',
      value: (external?.creditsBalance ?? balance) || 0,
      icon: Zap,
      color: 'text-yellow-400'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
      {statCards.map((stat, index) => (
        <Card key={index} className="bg-card/50 border-border/50 hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stat.value.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
