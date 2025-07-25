import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  Heart,
  Star,
  TrendingUp,
  Loader2,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { usePublicCharacters } from '@/hooks/useCharacters';
import { useChatCreation } from '@/hooks/useChatCreation';
import { CharacterCardSkeleton } from './CharacterCardSkeleton';

interface CharacterGridProps {
  characters: PublicCharacter[];
  isLoading: boolean;
  hasSearched: boolean;
  totalCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
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

const ITEMS_PER_PAGE = 20;

const PaginationControls = ({ 
  currentPage, 
  totalPages, 
  onPageChange 
}: { 
  currentPage: number; 
  totalPages: number; 
  onPageChange: (page: number) => void; 
}) => {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div className="flex justify-center items-center space-x-2 mt-8">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="border-gray-600 text-gray-300 hover:text-white hover:border-[#FF7A00]/50"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      
      {getVisiblePages().map((page, index) => (
        page === '...' ? (
          <span key={index} className="px-3 py-2 text-gray-500">
            ...
          </span>
        ) : (
          <Button
            key={page}
            variant={currentPage === page ? "default" : "outline"}
            size="sm"
            onClick={() => typeof page === 'number' && onPageChange(page)}
            className={
              currentPage === page
                ? "bg-[#FF7A00] text-white hover:bg-[#FF7A00]/80"
                : "border-gray-600 text-gray-300 hover:text-white hover:border-[#FF7A00]/50"
            }
          >
            {page}
          </Button>
        )
      ))}
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="border-gray-600 text-gray-300 hover:text-white hover:border-[#FF7A00]/50"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
};

export function CharacterGrid({ 
  characters, 
  isLoading, 
  hasSearched, 
  totalCount = 0,
  currentPage = 1,
  onPageChange
}: CharacterGridProps) {
  const navigate = useNavigate();
  const { startChat, isCreating } = useChatCreation();

  // Use initial characters if no search has been performed
  const { 
    data: initialCharacters = [], 
    isLoading: initialLoading
  } = usePublicCharacters(ITEMS_PER_PAGE, 0);

  // Determine which data to display
  const displayCharacters = hasSearched ? characters : initialCharacters;
  const loading = hasSearched ? isLoading : initialLoading;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Loading state with skeleton cards
  if (loading) {
    return (
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 lg:gap-8">
          {Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
            <CharacterCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state for search results
  if (hasSearched && characters.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-gray-400 text-lg mb-2">No characters found</div>
          <div className="text-gray-500 text-sm">Try adjusting your search criteria or filters</div>
        </div>
      </div>
    );
  }

  const handleViewCharacter = (character: PublicCharacter) => {
    navigate(`/character/${character.id}`);
  };

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-8">
      {/* Results Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-8 space-y-2 sm:space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0">
          <h2 className="text-white text-lg sm:text-xl font-semibold">
            {hasSearched ? (
              <>
                {totalCount} <span className="hidden sm:inline">Characters</span> Found
                {totalCount > ITEMS_PER_PAGE && (
                  <span className="text-gray-400 text-sm sm:text-base font-normal ml-2">
                    (Page {currentPage} of {totalPages})
                  </span>
                )}
              </>
            ) : (
              <>
                {displayCharacters.length} <span className="hidden sm:inline">Characters</span> Found
              </>
            )}
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
      >
        {displayCharacters.map((character, index) => (
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
      {displayCharacters.length === 0 && !loading && (
        <div className="text-center py-12 sm:py-16">
          <div className="text-gray-400 text-base sm:text-lg mb-2">No characters found</div>
          <div className="text-gray-500 text-sm">Try adjusting your search or filters</div>
        </div>
      )}

      {/* Pagination Controls */}
      {hasSearched && totalCount > ITEMS_PER_PAGE && onPageChange && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}

      {/* Load More for initial characters (non-search) */}
      {!hasSearched && displayCharacters.length > 0 && (
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
