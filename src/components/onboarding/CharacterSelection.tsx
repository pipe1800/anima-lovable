import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { getRecommendedCharacters } from '@/lib/supabase-queries';
import type { Character as BaseCharacter } from '@/types/chat';
import { getThumbUrl } from '@/utils/image';

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
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        setLoading(true);
        const { data: recommendedChars, error } = await getRecommendedCharacters(selectedVibes, 8);
        if (error) {
          console.error('Error fetching characters:', error);
          return;
        }
        setCharacters(recommendedChars || []);
      } catch (error) {
        console.error('Error in fetchCharacters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCharacters();
  }, [selectedVibes]);

  const handleCharacterSelect = (character: Character) => {
    onCharacterSelect(character);
    navigate(`/chat/${character.id}`, { 
      state: { 
        selectedCharacter: character,
        fromOnboarding: true,
        deferred: true
      } 
    });
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
          Choose Your First{' '}
          <span className="text-transparent bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 bg-clip-text">
            Companion
          </span>
        </h1>
        <p className="text-gray-300 text-base sm:text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed">
          Based on your vibe, we think you'll get along with one of these.
        </p>
      </div>

      {/* Character Grid - match Discover design (2 cols on mobile) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 lg:gap-8 mb-8">
        {characters.map((character, index) => (
          <Card
            key={character.id}
            className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20 relative overflow-hidden h-64 sm:h-80 group cursor-pointer"
            style={{
              animation: `fade-in 0.6s ease-out ${index * 0.1}s both`,
              contentVisibility: 'auto',
              containIntrinsicSize: '320px 512px'
            }}
            onClick={() => window.innerWidth < 768 ? handleCharacterSelect(character) : undefined}
          >
            <CardContent className="p-0 relative h-full">
              <img 
                src={getThumbUrl(character.avatar_url || undefined, { width: 512, quality: 70, format: 'webp' })} 
                alt={character.name}
                loading="lazy"
                decoding="async"
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
              <div className="absolute inset-0 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCharacterSelect(character);
                    }}
                    className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium text-sm"
                    size="sm"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Start Chat
                  </Button>
                </div>
              </div>

              {/* Description preview at bottom */}
              <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4">
                <p className="text-gray-300 text-sm sm:text-base line-clamp-1 sm:line-clamp-2 leading-relaxed mb-2">
                  {character.short_description || character.character_definitions?.[0]?.greeting || 'A mysterious character waiting to chat with you.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer actions */}
      <div className="text-center">
        <p className="text-gray-500 text-sm">
          Tap a character to begin a conversation
        </p>
      </div>
    </div>
  );
};

export default CharacterSelection;
