import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Heart,
  Star,
  BookOpen,
  Eye,
  Users
} from 'lucide-react';

interface WorldInfoCardProps {
  worldInfo: {
    id: string;
    name: string;
    short_description: string | null;
    interaction_count: number;
    created_at: string;
    creator: {
      id: string;
      username: string;
      avatar_url: string | null;
    } | null;
    likes_count: number;
    favorites_count: number;
    usage_count: number;
    tags?: Array<{
      id: number;
      name: string;
    }>;
  };
  index: number;
}

export function WorldInfoCard({ worldInfo, index }: WorldInfoCardProps) {
  const navigate = useNavigate();

  const handleViewWorldInfo = () => {
    navigate(`/world-info-view/${worldInfo.id}`);
  };

  return (
    <Card
      className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-2xl hover:shadow-[#FF7A00]/20 group overflow-hidden hover:scale-105 hover:-translate-y-2 transform h-[420px]"
      style={{
        animation: `fade-in 0.6s ease-out ${index * 0.1}s both`
      }}
    >
      <CardContent className="p-0">
        {/* World Info Avatar Section - Top Half */}
        <div className="relative h-32 bg-gradient-to-br from-[#FF7A00]/10 to-[#FF7A00]/5 flex items-center justify-center">
           <Avatar className="w-24 h-24 ring-4 ring-[#FF7A00]/30 group-hover:ring-[#FF7A00]/60 transition-all duration-300">
            <AvatarFallback className="bg-gradient-to-br from-[#FF7A00] to-[#FF7A00]/70 text-white font-bold text-2xl">
              <BookOpen className="w-8 h-8" />
            </AvatarFallback>
          </Avatar>
        </div>

        {/* World Info Details - Bottom Half */}
        <div className="p-5 relative flex flex-col h-[288px]">
          {/* Name */}
          <h3 className="text-white font-bold text-2xl group-hover:text-[#FF7A00] transition-colors line-clamp-1 mb-3">
            {worldInfo.name}
          </h3>

          {/* Description */}
          <p className="text-gray-400 text-lg line-clamp-2 leading-relaxed mb-4 flex-shrink-0" style={{ height: '3.5rem' }}>
            {worldInfo.short_description || "No description available"}
          </p>

          {/* Tags - Fixed height container */}
          <div className="mb-4 flex-shrink-0" style={{ height: '2rem' }}>
            {worldInfo.tags && worldInfo.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {worldInfo.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="text-base">
                    {tag.name}
                  </Badge>
                ))}
                {worldInfo.tags.length > 2 && (
                  <Badge variant="secondary" className="text-base">
                    +{worldInfo.tags.length - 2}
                  </Badge>
                )}
              </div>
            ) : (
              <div></div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-lg mb-4 flex-shrink-0">
            <div className="flex items-center space-x-1 text-gray-300">
              <Heart className="w-5 h-5" />
              <span>{worldInfo.likes_count.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-1 text-gray-300">
              <Star className="w-5 h-5" />
              <span>{worldInfo.favorites_count.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-1 text-gray-300">
              <Users className="w-5 h-5" />
              <span>{worldInfo.usage_count.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-1 text-gray-300">
              <Eye className="w-5 h-5" />
              <span>{worldInfo.interaction_count.toLocaleString()}</span>
            </div>
          </div>

          {/* Bottom section with creator and button */}
          <div className="flex-1 flex items-end justify-between">
            {/* Creator */}
            <p className="text-gray-500 text-base">
              by @{worldInfo.creator?.username || 'Unknown'}
            </p>

            {/* Action Button */}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleViewWorldInfo();
              }}
              variant="outline"
              size="sm"
              className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent"
            >
              <BookOpen className="w-4 h-4 mr-2" />
              View
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}