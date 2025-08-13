import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatNumberWithK } from '@/lib/utils/formatting';

interface RelatedCharactersCarouselProps {
  currentCharacterId: string;
  tags: Array<{ id: number; name: string }>;
}

interface RelatedCharacter {
  id: string;
  name: string;
  avatar_url: string | null;
  short_description: string | null;
  creator: {
    username: string;
    avatar_url: string | null;
  } | null;
  tags: Array<{ id: number; name: string }>;
  likes_count: number;
  chats_count: number;
}

const fetchRelatedCharacters = async (currentCharacterId: string, tagIds: number[]): Promise<RelatedCharacter[]> => {
  const { data, error } = await supabase
    .rpc('related_characters', { current_character_id: currentCharacterId, tag_ids: tagIds || [] });

  if (error) throw error;

  const normalize = (list: any[]): RelatedCharacter[] =>
    (list || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      avatar_url: c.avatar_url ?? null,
      short_description: c.short_description ?? null,
      creator: c.creator || null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      likes_count: c.likes_count ?? 0,
      chats_count: c.chats_count ?? 0,
    }));

  return normalize(data as any[]);
};

export function RelatedCharactersCarousel({ currentCharacterId, tags }: RelatedCharactersCarouselProps) {
  const navigate = useNavigate();
  const tagIds = tags.map(tag => tag.id);

  const { data: relatedCharacters = [], isLoading } = useQuery({
    queryKey: ['relatedCharacters', currentCharacterId, tagIds],
    queryFn: () => fetchRelatedCharacters(currentCharacterId, tagIds),
    enabled: !!currentCharacterId,
  });

  const handleCharacterClick = (characterId: string) => {
    navigate(`/character/${characterId}`);
  };

  if (isLoading) {
    return (
      <div className="flex space-x-3 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="w-48 flex-shrink-0">
            <Card className="overflow-hidden">
              <div className="aspect-[3/4] bg-muted animate-pulse" />
              <CardContent className="p-3">
                <div className="h-4 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  if (relatedCharacters.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No related characters found</p>
      </div>
    );
  }

  return (
    <div className="flex space-x-3 overflow-x-auto pb-2">
      {relatedCharacters.map((character) => (
        <div 
          key={character.id} 
          className="w-48 flex-shrink-0 cursor-pointer"
          onClick={() => handleCharacterClick(character.id)}
        >
          <Card className="overflow-hidden hover:shadow-md transition-shadow">
            <div className="aspect-[3/4] relative overflow-hidden">
              <img
                src={character.avatar_url || "/placeholder.svg"}
                alt={character.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              
              {/* Stats overlay */}
              <div className="absolute bottom-2 left-2 right-2">
                <div className="flex items-center justify-between text-white text-xs">
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <MessageCircle className="w-3 h-3" />
                      <span>{formatNumberWithK(character.chats_count || 0)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Heart className="w-3 h-3" />
                      <span>{formatNumberWithK(character.likes_count || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <CardContent className="p-3">
              <h3 className="font-semibold text-sm text-foreground mb-1 truncate">
                {character.name}
              </h3>
              
              <div className="flex items-center space-x-1 mb-2">
                <Avatar className="w-4 h-4">
                  <AvatarImage src={character.creator?.avatar_url || "/placeholder.svg"} />
                  <AvatarFallback className="text-xs">
                    {character.creator?.username?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground truncate">
                  @{character.creator?.username || 'Unknown'}
                </span>
              </div>

              {character.short_description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {character.short_description}
                </p>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {character.tags?.slice(0, 2).map((tag) => (
                  <Badge 
                    key={tag.id} 
                    variant="secondary" 
                    className="text-xs px-1 py-0"
                  >
                    {tag.name}
                  </Badge>
                ))}
                {character.tags && character.tags.length > 2 && (
                  <span className="text-xs text-muted-foreground">+{character.tags.length - 2}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}