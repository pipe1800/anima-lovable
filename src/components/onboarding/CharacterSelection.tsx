import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle } from 'lucide-react';
import { getRecommendedCharacters, toggleCharacterFavorite, isCharacterFavorited } from '@/lib/supabase-queries';
import { useCurrentUser } from '@/hooks/useProfile';
import { toast } from 'sonner';
import type { Character as BaseCharacter } from '@/types/chat';

// Extend the base Character type with onboarding-specific fields
interface Character extends BaseCharacter {
  character_definitions?: Array<{ greeting: string }>;
  likes_count?: number;
  favorited?: boolean;
}

interface CharacterSelectionProps {
  selectedVibes: string[];
  onCharacterSelect: (character: Character) => void;
  onSkip: () => void;
}

const CharacterSelection = ({ selectedVibes, onCharacterSelect, onSkip }: CharacterSelectionProps) => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        setLoading(true);
        console.log('CharacterSelection: Starting to fetch characters with vibes:', selectedVibes);
        const { data: recommendedChars, error } = await getRecommendedCharacters(selectedVibes, 8);
        
        console.log('CharacterSelection: getRecommendedCharacters result:', { data: recommendedChars, error });
        
        if (error) {
          console.error('Error fetching characters:', error);
          return;
        }

        // Check favorite status for each character
        if (user && recommendedChars) {
          const charactersWithFavorites = await Promise.all(
            recommendedChars.map(async (char) => {
              const { data: favorited } = await isCharacterFavorited(user.id, char.id);
              return { ...char, favorited };
            })
          );
          setCharacters(charactersWithFavorites);
        } else {
          setCharacters(recommendedChars || []);
        }
      } catch (error) {
        console.error('Error in fetchCharacters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCharacters();
  }, [selectedVibes, user]);

  const handleCharacterSelect = (character: Character) => {
    console.log('Selected character:', character);
    onCharacterSelect(character);
    // Navigate to chat with selected character and fromOnboarding flag
    navigate('/chat', { 
      state: { 
        selectedCharacter: character,
        fromOnboarding: true 
      } 
    });
  };

  const handleToggleFavorite = async (e: React.MouseEvent, characterId: string) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error('Please log in to favorite characters');
      return;
    }

    try {
      const { data, error } = await toggleCharacterFavorite(user.id, characterId);
      
      if (error) {
        toast.error('Failed to update favorite');
        return;
      }

      // Update local state
      setCharacters(chars => 
        chars.map(char => 
          char.id === characterId 
            ? { ...char, favorited: data?.favorited }
            : char
        )
      );

      toast.success(data?.favorited ? 'Added to favorites' : 'Removed from favorites');
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Failed to update favorite');
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto text-center px-4">
        <div className="text-white">Loading characters...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto text-center px-2 sm:px-4">
      {/* Header */}
      <div className="mb-8 sm:mb-12">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 sm:mb-6">
          Your First{' '}
          <span className="text-transparent bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 bg-clip-text">
            Encounter
          </span>
        </h1>
        <p className="text-gray-300 text-base sm:text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed">
          Based on your vibe, we think you'll get along with one of these. 
          Choose your first companion to start chatting.
        </p>
      </div>

      {/* Character Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-8">
        {characters.map((character, index) => (
          <Card
            key={character.id}
            className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20 relative overflow-hidden h-64 sm:h-80 group cursor-pointer"
            style={{
              animationDelay: `${index * 0.1}s`
            }}
            onClick={() => handleCharacterSelect(character)}
          >
            <div className="p-0 relative h-full">
              <img 
                src={character.avatar_url || "/placeholder.svg"} 
                alt={character.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              
              {/* Name at top */}
              <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-12 sm:right-16">
                <h3 className="text-white font-bold text-sm sm:text-lg group-hover:text-[#FF7A00] transition-colors truncate">
                  {character.name.length > 12 ? `${character.name.substring(0, 12)}...` : character.name}
                </h3>
              </div>

              {/* Action Button - Center - Show on mobile, hover on desktop */}
              <div className="absolute inset-0 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCharacterSelect(character);
                  }}
                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium"
                  size="sm"
                >
                  <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="text-xs sm:text-sm">Start Chat</span>
                </Button>
              </div>

              {/* Favorite button */}
              <Button
                onClick={(e) => handleToggleFavorite(e, character.id)}
                variant="ghost"
                size="icon"
                className={`absolute top-3 sm:top-4 right-3 sm:right-4 z-10 h-6 w-6 sm:h-8 sm:w-8 rounded-full ${
                  character.favorited 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/70'
                }`}
              >
                <Heart className={`h-3 w-3 sm:h-4 sm:w-4 ${character.favorited ? 'fill-current' : ''}`} />
              </Button>

              {/* Description preview at bottom - Hide on mobile to save space */}
              <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 hidden sm:block">
                <p className="text-gray-300 text-sm line-clamp-3 leading-relaxed">
                  {character.short_description || character.character_definitions?.[0]?.greeting || 'A mysterious character waiting to chat with you.'}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Footer actions */}
      <div className="text-center">
        <p className="text-gray-500 text-sm">
          Click on any character to begin your first conversation
        </p>
      </div>
    </div>
  );
};

export default CharacterSelection;
