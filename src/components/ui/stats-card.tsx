import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
  className?: string;
  largeValue?: boolean; // New prop for larger credit font
}

export const StatsCard = React.memo(({ 
  title, 
  value, 
  icon: Icon, 
  iconColor = 'text-[#FF7A00]',
  trend,
  onClick,
  className = '',
  largeValue = false
}: StatsCardProps) => {
  return (
    <Card 
      className={`bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs sm:text-sm">{title}</p>
            <p className={`text-white font-bold ${largeValue ? 'text-xl sm:text-3xl' : 'text-lg sm:text-2xl'}`}>{value}</p>
            {trend && (
              <p className={`text-xs mt-1 ${trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </p>
            )}
          </div>
          <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${iconColor}`} />
        </div>
      </CardContent>
    </Card>
  );
});

StatsCard.displayName = 'StatsCard';
