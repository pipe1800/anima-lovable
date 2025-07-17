import React from 'react';
import { 
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePublicWorldInfos } from '@/hooks/useWorldInfos';
import { WorldInfoCard } from './WorldInfoCard';

interface WorldInfoGridProps {
  searchQuery: string;
  sortBy: string;
  filterBy: string;
}

type PublicWorldInfo = {
  id: string;
  name: string;
  short_description: string | null;
  interaction_count: number;
  created_at: string;
  creator: any;
  likes_count: number;
  favorites_count: number;
  usage_count: number;
};

export function WorldInfoGrid({ searchQuery, sortBy, filterBy }: WorldInfoGridProps) {
  // Use React Query hook for public world infos
  const { 
    data: worldInfos = [], 
    isLoading: loading, 
    error 
  } = usePublicWorldInfos();

  // Filter and sort world infos based on props
  const filteredWorldInfos = worldInfos.filter(worldInfo => {
    const matchesSearch = worldInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         worldInfo.short_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         false;
    
    // For now, filterBy will just filter by name until we have proper categories
    const matchesFilter = filterBy === 'all' || 
                         worldInfo.name.toLowerCase().includes(filterBy.toLowerCase());
    
    return matchesSearch && matchesFilter;
  });

  const sortedWorldInfos = [...filteredWorldInfos].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'popularity':
        return b.usage_count - a.usage_count;
      case 'conversations':
        return b.interaction_count - a.interaction_count;
      default: // relevance
        return b.usage_count - a.usage_count;
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
        <span className="ml-2 text-white">Loading world infos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="text-red-400 text-lg mb-2">{error.message}</div>
        <div className="text-gray-500 text-sm">Please try again later</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Results Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <h2 className="text-white text-xl font-semibold">
            {sortedWorldInfos.length} World Infos Found
          </h2>
          <div className="flex items-center space-x-2 text-gray-400 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>Updated 2 minutes ago</span>
          </div>
        </div>
      </div>

      {/* World Info Grid */}
      <div 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 transition-all duration-500 ease-in-out"
        style={{
          animation: 'fade-in 0.6s ease-out'
        }}
      >
        {sortedWorldInfos.map((worldInfo, index) => (
          <WorldInfoCard
            key={worldInfo.id}
            worldInfo={worldInfo}
            index={index}
          />
        ))}
      </div>

      {/* Empty State */}
      {sortedWorldInfos.length === 0 && (
        <div className="text-center py-16">
          <div className="text-gray-400 text-lg mb-2">No world infos found</div>
          <div className="text-gray-500 text-sm">Try adjusting your search or filters</div>
        </div>
      )}

      {/* Load More */}
      {sortedWorldInfos.length > 0 && (
        <div className="flex justify-center mt-16">
          <Button
            variant="outline"
            className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent px-10 py-4 text-lg font-medium"
          >
            Load More World Infos
          </Button>
        </div>
      )}
    </div>
  );
}