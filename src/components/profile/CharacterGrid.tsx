
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatCreation } from '@/hooks/useChatCreation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Heart, Edit, User } from 'lucide-react';
import { getUserCharacters } from '@/lib/supabase-queries';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

interface CharacterGridProps {
  type: 'created' | 'favorites';
}

export const CharacterGrid = ({ type }: CharacterGridProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startChat, isCreating } = useChatCreation();

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ['user-characters', user?.id, type],
    queryFn: async () => {
      if (!user?.id) return [];
      if (type === 'created') {
        const { data } = await getUserCharacters(user.id);
        return data || [];
      }
      // For favorites, we'll return empty for now since we don't have a favorites system yet
      return [];
    },
    enabled: !!user?.id,
  });

  // ... keep existing code (profile character grid queries)

  const handleEditCharacter = (character: any) => {
    navigate('/character-creator', { 
      state: { 
        editingCharacter: character,
        isEditing: true 
      } 
    });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-[#1a1a2e] border-gray-700/50 animate-pulse">
            <CardContent className="p-0">
              <div className="h-48 bg-gray-700/30"></div>
              <div className="p-5 space-y-4">
                <div className="h-6 bg-gray-700/30 rounded"></div>
                <div className="h-4 bg-gray-700/30 rounded"></div>
                <div className="h-4 bg-gray-700/30 rounded w-2/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          {type === 'created' ? 'No characters created yet' : 'No favorite characters yet'}
        </div>
        {type === 'created' && (
          <Button 
            onClick={() => navigate('/character-creator')}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
          >
            Create Your First Character
          </Button>
        )}
        {type === 'favorites' && (
          <Button 
            onClick={() => navigate('/discover')}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
          >
            Discover Characters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-6">
      {characters.map((character) => (
        <Card
          key={character.id}
          className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20 relative overflow-hidden h-80 group"
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

            {/* Created Badge */}
            {type === 'created' && (
              <div className="absolute top-4 right-4">
                <Badge variant="outline" className="text-[#FF7A00] border-[#FF7A00]/30 bg-black/40">
                  Created
                </Badge>
              </div>
            )}

            {/* Action Buttons - Center */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
              <div className="flex gap-2">
                <Button
                  onClick={() => startChat(character)}
                  disabled={isCreating}
                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium disabled:opacity-50"
                  size="sm"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  {isCreating ? 'Creating...' : 'Chat'}
                </Button>
                {type === 'created' && (
                  <Button
                    onClick={() => handleEditCharacter(character)}
                    variant="outline"
                    className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 bg-black/40"
                    size="sm"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Description preview at bottom */}
            <div className="absolute bottom-4 left-4 right-4">
              <p className="text-gray-300 text-sm line-clamp-3 leading-relaxed">
                {character.short_description || 'No description available'}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
