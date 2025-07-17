
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, MessageSquare, Zap } from 'lucide-react';
import { useProfileStats } from '@/hooks/useProfile';

export const ProfileStats = () => {
  const { data: stats, isLoading } = useProfileStats();

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
      value: stats?.characterCount || 0,
      icon: Users,
      color: 'text-[#FF7A00]'
    },
    {
      title: 'Total Conversations',
      value: stats?.chatCount || 0,
      icon: MessageSquare,
      color: 'text-blue-400'
    },
    {
      title: 'Credits Balance',
      value: stats?.creditsBalance || 0,
      icon: Zap,
      color: 'text-yellow-400'
    },
    {
      title: 'Followers',
      value: stats?.followersCount || 0,
      icon: TrendingUp,
      color: 'text-green-400'
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
