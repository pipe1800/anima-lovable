import React from 'react';
import { MessageCircle, Heart, Sparkles, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsBarProps {
  stats: {
    totalChats: number;
    totalCharacters: number;
    totalFavorites: number;
    totalPersonas: number;
  };
}

const StatItem: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  color?: string;
}> = ({ icon: Icon, label, value, color = "text-primary" }) => (
  <div className="flex items-center gap-2 px-3 py-2">
    <Icon className={`w-4 h-4 ${color}`} />
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1">
      <span className="font-semibold">{value.toLocaleString()}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  </div>
);

export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/50">
          <StatItem 
            icon={MessageCircle} 
            label="Chats" 
            value={stats.totalChats} 
            color="text-blue-500"
          />
          <StatItem 
            icon={Sparkles} 
            label="Characters" 
            value={stats.totalCharacters} 
            color="text-purple-500"
          />
          <StatItem 
            icon={Heart} 
            label="Favorites" 
            value={stats.totalFavorites} 
            color="text-red-500"
          />
          <StatItem 
            icon={Users} 
            label="Personas" 
            value={stats.totalPersonas} 
            color="text-green-500"
          />
        </div>
      </CardContent>
    </Card>
  );
};
