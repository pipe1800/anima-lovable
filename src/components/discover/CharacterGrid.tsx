import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  Heart,
  Star,
  TrendingUp,
  Loader2,
  Eye
} from 'lucide-react';
import { usePublicCharacters } from '@/hooks/useCharacters';
import { useChatCreation } from '@/hooks/useChatCreation';

interface CharacterGridProps {
  searchQuery: string;
  sortBy: string;
  filterBy: string;
  advancedFilters?: {
    tags: string[];
    creator: string;
    nsfw: boolean;
    gender: string;
  };
}

type PublicCharacter = {
  id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  interaction_count: number;
  created_at: string;
  creator: any;
  actual_chat_count: number;
  likes_count: number;
  favorites_count: number;
  tags: { id: number; name: string }[];
};

export function CharacterGrid({ searchQuery, sortBy, filterBy, advancedFilters }: CharacterGridProps) {
  const navigate = useNavigate();
  
  // Use React Query hook for public characters
  const { 
    data: characters = [], 
    isLoading: loading, 
    error 
  } = usePublicCharacters(50, 0);

  const { startChat, isCreating } = useChatCreation();

  const handleViewCharacter = (character: PublicCharacter) => {
    navigate(`/character/${character.id}`);
  };

  // Filter and sort characters based on props
  const filteredCharacters = characters.filter(character => {
    // Search in name, description, and tags
    const searchTerm = searchQuery.toLowerCase();
    const matchesSearch = character.name.toLowerCase().includes(searchTerm) ||
                         character.short_description?.toLowerCase().includes(searchTerm) ||
                         character.tags?.some(tag => tag.name.toLowerCase().includes(searchTerm)) ||
                         character.creator?.username?.toLowerCase().includes(searchTerm);
    
    // Filter by category/tag
    const matchesFilter = filterBy === 'all' || 
                         character.tags?.some(tag => tag.name.toLowerCase() === filterBy.toLowerCase()) ||
                         character.name.toLowerCase().includes(filterBy.toLowerCase());
    
    // Advanced filters
    let matchesAdvanced = true;
    if (advancedFilters) {
      // Filter by selected tags
      if (advancedFilters.tags.length > 0) {
        matchesAdvanced = matchesAdvanced && advancedFilters.tags.some(selectedTag =>
          character.tags?.some(tag => tag.name.toLowerCase() === selectedTag.toLowerCase())
        );
      }
      
      // Filter by creator
      if (advancedFilters.creator) {
        matchesAdvanced = matchesAdvanced && 
          character.creator?.username?.toLowerCase().includes(advancedFilters.creator.toLowerCase());
      }
      
      // NSFW filter (assuming we have NSFW tag)
      if (!advancedFilters.nsfw) {
        matchesAdvanced = matchesAdvanced && 
          !character.tags?.some(tag => tag.name.toLowerCase() === 'nsfw');
      }
      
      // Gender filter (assuming we have gender tags)
      if (advancedFilters.gender !== 'any') {
        matchesAdvanced = matchesAdvanced && 
          character.tags?.some(tag => tag.name.toLowerCase() === advancedFilters.gender.toLowerCase());
      }
    }
    
    return matchesSearch && matchesFilter && matchesAdvanced;
  });

  const sortedCharacters = [...filteredCharacters].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'popularity':
        // Weighted popularity score combining likes, favorites, and chat count
        const scoreA = (a.likes_count * 2) + (a.favorites_count * 3) + (a.actual_chat_count * 1);
        const scoreB = (b.likes_count * 2) + (b.favorites_count * 3) + (b.actual_chat_count * 1);
        return scoreB - scoreA;
      case 'relevance':
        if (searchQuery) {
          // Relevance based on exact matches and popularity
          const aExactMatch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) ? 100 : 0;
          const bExactMatch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) ? 100 : 0;
          const aPopularity = (a.likes_count * 2) + (a.favorites_count * 3) + (a.actual_chat_count * 1);
          const bPopularity = (b.likes_count * 2) + (b.favorites_count * 3) + (b.actual_chat_count * 1);
          return (bExactMatch + bPopularity) - (aExactMatch + aPopularity);
        }
        return b.actual_chat_count - a.actual_chat_count;
      default:
        return b.actual_chat_count - a.actual_chat_count;
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
        <span className="ml-2 text-white">Loading characters...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="text-red-400 text-lg mb-2">Failed to load characters</div>
        <div className="text-gray-500 text-sm">Please try again later</div>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-8">
      {/* Results Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-8 space-y-2 sm:space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0">
          <h2 className="text-white text-lg sm:text-xl font-semibold">
            {sortedCharacters.length} <span className="hidden sm:inline">Characters</span> Found
          </h2>
          <div className="flex items-center space-x-2 text-gray-400 text-xs sm:text-sm">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>Updated 2 minutes ago</span>
          </div>
        </div>
      </div>

      {/* Character Grid - 2 columns on mobile, responsive thereafter */}
      <div 
        className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 lg:gap-8 transition-all duration-500 ease-in-out"
        style={{
          animation: 'fade-in 0.6s ease-out'
        }}
      >
        {sortedCharacters.map((character, index) => (
          <Card
            key={character.id}
            className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20 relative overflow-hidden h-64 sm:h-80 group cursor-pointer"
            style={{
              animation: `fade-in 0.6s ease-out ${index * 0.1}s both`
            }}
            onClick={() => window.innerWidth < 768 ? handleViewCharacter(character) : undefined}
          >
            <CardContent className="p-0 relative h-full">
              <img 
                src={character.avatar_url || "/placeholder.svg"} 
                alt={character.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              
              {/* Name at top */}
              <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4">
                <h3 className="text-white font-bold text-base sm:text-lg group-hover:text-[#FF7A00] transition-colors truncate">
                  {character.name.length > 12 ? `${character.name.substring(0, 12)}...` : character.name}
                </h3>
              </div>

              {/* Action Buttons - Center - Hidden on mobile */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hidden sm:flex">
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewCharacter(character);
                    }}
                    variant="outline"
                    className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 bg-black/40 text-sm"
                    size="sm"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Character
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      startChat(character);
                    }}
                    disabled={isCreating}
                    className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium text-sm disabled:opacity-50"
                    size="sm"
                  >
                    {isCreating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <MessageCircle className="w-4 h-4 mr-2" />
                    )}
                    {isCreating ? 'Creating...' : 'Start Chat'}
                  </Button>
                </div>
              </div>

              {/* Description preview and stats at bottom */}
              <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4">
                <p className="text-gray-300 text-xs sm:text-sm line-clamp-1 sm:line-clamp-2 leading-relaxed mb-2">
                  {character.short_description || "No description available"}
                </p>
                
                {/* Likes and Favorites Stats */}
                <div className="flex items-center justify-between text-gray-400">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1">
                      <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm">{character.likes_count}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Star className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm">{character.favorites_count}</span>
                    </div>
                  </div>
                  {character.creator && (
                    <span className="text-xs text-gray-500 truncate max-w-[80px] sm:max-w-[120px]">
                      @{character.creator.username}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {sortedCharacters.length === 0 && (
        <div className="text-center py-12 sm:py-16">
          <div className="text-gray-400 text-base sm:text-lg mb-2">No characters found</div>
          <div className="text-gray-500 text-sm">Try adjusting your search or filters</div>
        </div>
      )}

      {/* Load More */}
      {sortedCharacters.length > 0 && (
        <div className="flex justify-center mt-8 sm:mt-16">
          <Button
            variant="outline"
            className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent px-6 sm:px-10 py-3 sm:py-4 text-base sm:text-lg font-medium"
          >
            <span className="hidden sm:inline">Load More Characters</span>
            <span className="sm:hidden">Load More</span>
          </Button>
        </div>
      )}
    </div>
  );
}
