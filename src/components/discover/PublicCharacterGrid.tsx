import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  Heart,
  TrendingUp,
  Loader2,
  Eye
} from 'lucide-react';
import { usePublicCharacters } from '@/hooks/useCharacters';

interface PublicCharacterGridProps {
  searchQuery: string;
  sortBy: string;
  filterBy: string;
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
};

export function PublicCharacterGrid({ searchQuery, sortBy, filterBy }: PublicCharacterGridProps) {
  const navigate = useNavigate();
  const { 
    data: characters = [], 
    isLoading: loading, 
    error 
  } = usePublicCharacters();

  const handleSignupToChat = () => {
    navigate('/auth?mode=signup');
  };

  const handleViewCharacter = (character: PublicCharacter) => {
    navigate(`/characters/${character.id}`);
  };

  // Filter and sort characters based on props
  const filteredCharacters = characters.filter(character => {
    const matchesSearch = character.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         character.short_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         false;
    
    const matchesFilter = filterBy === 'all' || 
                         character.name.toLowerCase().includes(filterBy.toLowerCase());
    
    return matchesSearch && matchesFilter;
  });

  const sortedCharacters = [...filteredCharacters].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'popularity':
      case 'conversations':
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
            {sortedCharacters.length} Characters Found
          </h2>
          <div className="flex items-center space-x-2 text-gray-400 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>Updated 2 minutes ago</span>
          </div>
        </div>
      </div>

      {/* Character Grid */}
      <div 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 transition-all duration-500 ease-in-out"
        style={{
          animation: 'fade-in 0.6s ease-out'
        }}
      >
        {sortedCharacters.map((character, index) => (
          <Card
            key={character.id}
            className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20 relative overflow-hidden h-80 group"
            style={{
              animation: `fade-in 0.6s ease-out ${index * 0.1}s both`
            }}
          >
            <CardContent className="p-0 relative h-full">
              <img 
                src={character.avatar_url || "/placeholder.svg"} 
                alt={character.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              
              {/* Name at top */}
              <div className="absolute top-4 left-4 right-4">
                <h3 className="text-white font-bold text-lg group-hover:text-[#FF7A00] transition-colors truncate">
                  {character.name.length > 15 ? `${character.name.substring(0, 15)}...` : character.name}
                </h3>
              </div>

              {/* Action Buttons - Center */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => handleViewCharacter(character)}
                    variant="outline"
                    className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 bg-black/40"
                    size="sm"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Character
                  </Button>
                  <Button
                    onClick={handleSignupToChat}
                    className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium"
                    size="sm"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Signup to Chat
                  </Button>
                </div>
              </div>

              {/* Description preview at bottom */}
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-gray-300 text-sm line-clamp-3 leading-relaxed">
                  {character.short_description || "No description available"}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {sortedCharacters.length === 0 && (
        <div className="text-center py-16">
          <div className="text-gray-400 text-lg mb-2">No characters found</div>
          <div className="text-gray-500 text-sm">Try adjusting your search or filters</div>
        </div>
      )}

      {/* Load More */}
      {sortedCharacters.length > 0 && (
        <div className="flex justify-center mt-16">
          <Button
            variant="outline"
            className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent px-10 py-4 text-lg font-medium"
          >
            Load More Characters
          </Button>
        </div>
      )}
    </div>
  );
}