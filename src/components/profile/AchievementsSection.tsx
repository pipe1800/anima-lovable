
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Trophy, Users, MessageSquare, Crown, Zap, Star, Award, Target } from 'lucide-react';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  earned: boolean;
  category: 'creator' | 'social' | 'engagement' | 'special';
}

export const AchievementsSection = () => {
  // Mock achievements data - in real app this would come from API
  const achievements: Achievement[] = [
    {
      id: 'top-creator',
      name: 'Top 1% Creator',
      description: 'Created characters loved by thousands',
      icon: Crown,
      earned: true,
      category: 'creator'
    },
    {
      id: 'chat-master',
      name: '100k Chats',
      description: 'Reached 100,000 total conversations',
      icon: MessageSquare,
      earned: true,
      category: 'engagement'
    },
    {
      id: 'community-legend',
      name: 'Community Legend',
      description: 'Recognized as a pillar of the community',
      icon: Star,
      earned: true,
      category: 'special'
    },
    {
      id: 'prolific-creator',
      name: 'Prolific Creator',
      description: 'Created 50+ unique characters',
      icon: Trophy,
      earned: false,
      category: 'creator'
    },
    {
      id: 'social-butterfly',
      name: 'Social Network',
      description: 'Gained 10,000+ followers',
      icon: Users,
      earned: false,
      category: 'social'
    },
    {
      id: 'lightning-fast',
      name: 'Lightning Creator',
      description: 'Created 10 characters in one day',
      icon: Zap,
      earned: false,
      category: 'creator'
    },
    {
      id: 'perfectionist',
      name: 'Perfectionist',
      description: 'Achieved 5.0 average rating on all characters',
      icon: Target,
      earned: false,
      category: 'creator'
    },
    {
      id: 'hall-of-fame',
      name: 'Hall of Fame',
      description: 'Inducted into the creator hall of fame',
      icon: Award,
      earned: false,
      category: 'special'
    }
  ];

  const earnedCount = achievements.filter(a => a.earned).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Trophy className="h-5 w-5 text-[#FF7A00]" />
          <span>Achievements</span>
        </h3>
        <p className="text-muted-foreground text-sm">
          {earnedCount} of {achievements.length} earned
        </p>
      </div>

      {/* Achievements Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <TooltipProvider>
          {achievements.map((achievement) => {
            const IconComponent = achievement.icon;
            return (
              <Tooltip key={achievement.id}>
                <TooltipTrigger asChild>
                  <Card
                    className={`
                      relative overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 border-2
                      ${achievement.earned 
                        ? 'bg-gradient-to-br from-[#FF7A00]/20 to-[#FF7A00]/5 border-[#FF7A00]/50 hover:border-[#FF7A00] hover:shadow-lg hover:shadow-[#FF7A00]/20' 
                        : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/50'
                      }
                    `}
                  >
                    <CardContent className="p-4 flex flex-col items-center justify-center aspect-square">
                      {/* Cyber glow effect for earned badges */}
                      {achievement.earned && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FF7A00]/10 to-transparent animate-pulse" />
                      )}
                      
                      {/* Badge Icon */}
                      <div className={`
                        relative z-10 p-3 rounded-full transition-all duration-300
                        ${achievement.earned 
                          ? 'bg-gradient-to-br from-[#FF7A00] to-[#FF7A00]/70 text-white shadow-lg shadow-[#FF7A00]/30' 
                          : 'bg-gray-700/50 text-gray-500'
                        }
                      `}>
                        <IconComponent className="h-6 w-6" />
                      </div>

                      {/* Cyber corner decorations for earned badges */}
                      {achievement.earned && (
                        <>
                          <div className="absolute top-1 left-1 w-2 h-2 border-l-2 border-t-2 border-[#FF7A00]/60" />
                          <div className="absolute top-1 right-1 w-2 h-2 border-r-2 border-t-2 border-[#FF7A00]/60" />
                          <div className="absolute bottom-1 left-1 w-2 h-2 border-l-2 border-b-2 border-[#FF7A00]/60" />
                          <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-[#FF7A00]/60" />
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent 
                  side="top" 
                  className="bg-[#1a1a1a] border-[#333] text-white max-w-xs"
                >
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-[#FF7A00]">{achievement.name}</p>
                    <p className="text-sm text-gray-300">{achievement.description}</p>
                    {!achievement.earned && (
                      <p className="text-xs text-gray-500 italic">Not yet earned</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Achievement Progress</span>
          <span className="text-sm text-[#FF7A00] font-medium">
            {Math.round((earnedCount / achievements.length) * 100)}%
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 transition-all duration-500 relative"
            style={{ width: `${(earnedCount / achievements.length) * 100}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
};
