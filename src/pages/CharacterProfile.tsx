import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MessageCircle, 
  Heart,
  ArrowLeft,
  Loader2,
  Star
} from 'lucide-react';
import { useCharacterProfile, useCharacterLikeStatus, useToggleCharacterLike } from '@/hooks/useCharacterProfile';
import { CharacterFoundationSection } from '@/components/character-profile/CharacterFoundationSection';
import { CharacterPersonalitySection } from '@/components/character-profile/CharacterPersonalitySection';
import { CharacterDialogueSection } from '@/components/character-profile/CharacterDialogueSection';
import { RelatedCharactersCarousel } from '@/components/character-profile/RelatedCharactersCarousel';
import { CharacterStatsSection } from '@/components/character-profile/CharacterStatsSection';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useChatCreation } from '@/hooks/useChatCreation';

export default function CharacterProfile() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { startChat, isCreating } = useChatCreation();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = React.useState(false);
  const descriptionRef = React.useRef<HTMLParagraphElement>(null);
  const [isTextTruncated, setIsTextTruncated] = React.useState(false);
  const queryClient = useQueryClient();
  
  // Use React Query hooks for optimized data fetching
  const { 
    data: character, 
    isLoading: loading, 
    error: characterError 
  } = useCharacterProfile(characterId);
  
  const { 
    data: isLiked = false 
  } = useCharacterLikeStatus(characterId);
  
  const toggleLikeMutation = useToggleCharacterLike();

  // Check if character is favorited
  const { data: isFavorited = false } = useQuery({
    queryKey: ['characterFavorited', characterId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      const { data, error } = await supabase
        .from('character_favorites')
        .select('id')
        .eq('character_id', characterId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) return false;
      return !!data;
    },
    enabled: !!characterId,
  });

  // Favorite/Unfavorite mutation
  const favoritesMutation = useMutation({
    mutationFn: async ({ characterId, isFavorited }: { characterId: string; isFavorited: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (isFavorited) {
        // Remove from favorites
        const { error } = await supabase
          .from('character_favorites')
          .delete()
          .eq('character_id', characterId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // Add to favorites
        const { error } = await supabase
          .from('character_favorites')
          .insert({
            character_id: characterId,
            user_id: user.id
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, { isFavorited }) => {
      queryClient.invalidateQueries({ queryKey: ['characterFavorited', characterId] });
      toast({
        title: isFavorited ? 'Removed from favorites' : 'Added to favorites',
        description: isFavorited 
          ? 'Character removed from your favorites' 
          : 'Character added to your favorites',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update favorites',
        variant: 'destructive',
      });
    },
  });

  const error = characterError?.message || null;

  // ... keep existing code (character profile queries)

  const handleLike = async () => {
    if (!character) return;

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/auth');
      return;
    }

    // Use the optimized mutation
    toggleLikeMutation.mutate({
      characterId: character.id,
      isLiked: isLiked
    });
  };

  const handleFavorite = async () => {
    if (!character) return;

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/auth');
      return;
    }

    favoritesMutation.mutate({
      characterId: character.id,
      isFavorited: isFavorited
    });
  };

  const description = character?.short_description || character?.character_definitions?.description || "No description available";

  // Better text truncation detection - check if the actual text would overflow 4 lines
  React.useEffect(() => {
    if (descriptionRef.current) {
      const tempElement = document.createElement('div');
      tempElement.style.position = 'absolute';
      tempElement.style.visibility = 'hidden';
      tempElement.style.width = descriptionRef.current.offsetWidth + 'px';
      tempElement.style.fontSize = '14px';
      tempElement.style.lineHeight = '1.125rem';
      tempElement.style.fontFamily = window.getComputedStyle(descriptionRef.current).fontFamily;
      tempElement.textContent = description;
      document.body.appendChild(tempElement);
      
      const maxHeight = parseFloat('1.125rem') * 4 * 16; // 4 lines * 1.125rem * 16px
      const actualHeight = tempElement.offsetHeight;
      
      setIsTextTruncated(actualHeight > maxHeight);
      document.body.removeChild(tempElement);
    }
  }, [description, character]);

  const toggleDescription = () => {
    setIsDescriptionExpanded(!isDescriptionExpanded);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-foreground">Loading character...</span>
        </div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-destructive text-lg mb-2">{error}</div>
          <Button onClick={() => navigate('/discover')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Layout */}
      <div className="md:hidden">
        {/* Hero Image Section */}
        <div className="relative h-[40vh] overflow-hidden m-3 rounded-lg">
          <img 
            src={character.avatar_url || "/placeholder.svg"} 
            alt={character.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          {/* Back Button - Mobile */}
          <div className="absolute top-2 left-2">
            <Button
              onClick={() => navigate('/discover')}
              variant="ghost"
              size="icon"
              className="bg-black/40 text-white hover:bg-black/60 w-8 h-8"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          {/* Character Name Overlay */}
          <div className="absolute bottom-3 left-3 right-3">
            <h1 className="text-2xl font-bold text-white mb-1">
              {character.name}
            </h1>
          </div>
        </div>

        {/* Stats Section */}
        <div className="px-3 py-2 bg-background border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <MessageCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg font-bold text-foreground">
                  {(character.actual_chat_count || 0) >= 1000 
                    ? `${((character.actual_chat_count || 0) / 1000).toFixed(1)}K` 
                    : character.actual_chat_count || 0}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Heart className={`w-4 h-4 ${isLiked ? 'text-red-500 fill-current' : 'text-muted-foreground'}`} />
                <span className="text-lg font-bold text-foreground">
                  {(character.likes_count || 0) >= 1000 
                    ? `${((character.likes_count || 0) / 1000).toFixed(1)}K` 
                    : character.likes_count || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Creator Info */}
        <div className="px-3 py-2 bg-background border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={character.creator?.avatar_url || "/placeholder.svg"} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {character.creator?.username?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-xs text-muted-foreground">Creator</div>
                <div className="text-sm font-semibold text-foreground">@{character.creator?.username || 'Unknown'}</div>
              </div>
            </div>
            
          </div>
        </div>

        {/* Description */}
        <div className="px-3 py-3">
          <div className={`${!isDescriptionExpanded ? 'h-[4.5rem]' : 'min-h-[4.5rem]'} transition-all duration-300 overflow-hidden`}>
            <p 
              ref={descriptionRef}
              className="text-sm text-foreground leading-[1.125rem]"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: isDescriptionExpanded ? 'none' : 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {description}
            </p>
          </div>
          {isTextTruncated && (
            <button
              onClick={toggleDescription}
              className="text-xs text-primary hover:underline mb-2 block"
            >
              {isDescriptionExpanded ? 'Show less' : 'Show more'}
            </button>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mb-3">
            {character.tags?.map((tag) => (
              <Badge 
                key={tag.id} 
                variant="secondary" 
                className="bg-secondary/50 text-secondary-foreground border border-border text-xs px-2 py-1"
              >
                {tag.name}
              </Badge>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col space-y-2">
            <Button
              onClick={() => character && startChat(character)}
              disabled={isCreating || !character}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 text-sm disabled:opacity-50"
            >
              {isCreating ? 'Creating Chat...' : 'Start Conversation'}
            </Button>
            <div className="flex space-x-2">
              <Button
                onClick={handleLike}
                variant="outline"
                className={`flex-1 py-2 text-sm ${
                  isLiked 
                    ? 'bg-red-500/20 text-red-400 border-red-500/50' 
                    : 'text-foreground hover:bg-secondary border-border'
                }`}
              >
                <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-current' : ''}`} />
                {isLiked ? 'Liked' : 'Like'}
              </Button>
              <Button
                onClick={handleFavorite}
                variant="outline"
                className={`flex-1 py-2 text-sm ${
                  isFavorited 
                    ? 'bg-yellow-500/20 text-yellow-600 border-yellow-500/50' 
                    : 'text-foreground hover:bg-secondary border-border'
                }`}
              >
                <Star className={`w-4 h-4 mr-2 ${isFavorited ? 'fill-current' : ''}`} />
                {isFavorited ? 'Favorited' : 'Add to Favorites'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:block">
        {/* Back Button - Above content */}
        <div className="p-4 pb-2">
          <Button
            onClick={() => navigate('/discover')}
            variant="ghost"
            size="sm"
            className="bg-secondary/50 text-foreground hover:bg-secondary text-xs"
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            Back to Discover
          </Button>
        </div>
        
        <div className="flex min-h-[calc(100vh-4rem)]">
          {/* Left Side - Character Image */}
          <div className="relative w-1/3 h-[50vh] overflow-hidden px-4">
            <div className="relative h-full overflow-hidden rounded-lg">
              <img 
                src={character.avatar_url || "/placeholder.svg"} 
                alt={character.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/20" />
              
              {/* Like Button Overlay */}
              <div className="absolute bottom-4 left-4">
                <Button
                  onClick={handleLike}
                  variant="ghost"
                  size="icon"
                  className={`w-10 h-10 rounded-full ${
                    isLiked 
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                      : 'bg-black/40 text-white hover:bg-black/60'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                </Button>
              </div>
            </div>
          </div>

        {/* Right Side - Character Info */}
        <div className="w-2/3 flex flex-col">
          {/* Header Section */}
          <div className="p-4 pb-3">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {character.name}
            </h1>
            
            {/* Stats Row */}
            <div className="flex items-center space-x-3 mb-3">
              <div className="flex items-center space-x-1 bg-secondary/50 px-2 py-1 rounded-full">
                <MessageCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {(character.actual_chat_count || 0) >= 1000 
                    ? `${((character.actual_chat_count || 0) / 1000).toFixed(1)}K` 
                    : character.actual_chat_count || 0}
                </span>
              </div>
              <div className="flex items-center space-x-1 bg-secondary/50 px-2 py-1 rounded-full">
                <Heart className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {(character.likes_count || 0) >= 1000 
                    ? `${((character.likes_count || 0) / 1000).toFixed(1)}K` 
                    : character.likes_count || 0}
                </span>
              </div>
            </div>

            {/* Creator Info */}
            <div className="flex items-center mb-4">
              <Avatar className="w-8 h-8">
                <AvatarImage src={character.creator?.avatar_url || "/placeholder.svg"} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {character.creator?.username?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="ml-2">
                <div className="text-xs text-muted-foreground">Creator</div>
                <div className="text-sm font-semibold text-foreground">@{character.creator?.username || 'Unknown'}</div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="px-4 flex-1">
            <div className={`${!isDescriptionExpanded ? 'h-[4.5rem]' : 'min-h-[4.5rem]'} transition-all duration-300 overflow-hidden`}>
              <p 
                ref={descriptionRef}
                className="text-foreground leading-[1.125rem] text-sm"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: isDescriptionExpanded ? 'none' : 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {description}
              </p>
            </div>
            {isTextTruncated && (
              <button
                onClick={toggleDescription}
                className="text-xs text-primary hover:underline mb-2 block"
              >
                {isDescriptionExpanded ? 'Show less' : 'Show more'}
              </button>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-3">
              {character.tags?.map((tag) => (
                <Badge 
                  key={tag.id} 
                  variant="secondary" 
                  className="bg-secondary/80 text-secondary-foreground px-3 py-1 text-xs"
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-4 pb-4">
            <div className="flex space-x-2">
              <Button
                onClick={() => character && startChat(character)}
                disabled={isCreating || !character}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 text-sm disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Start New Chat'}
              </Button>
              <Button
                onClick={handleFavorite}
                variant="outline"
                className={`flex-1 py-2 text-sm ${
                  isFavorited 
                    ? 'bg-yellow-500/20 text-yellow-600 border-yellow-500/50' 
                    : 'border-border hover:bg-secondary'
                }`}
              >
                <Star className={`w-4 h-4 mr-2 ${isFavorited ? 'fill-current' : ''}`} />
                {isFavorited ? 'Favorited' : 'Add to Favorites'}
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Related Characters Carousel */}
      <div className="px-3 md:px-6 py-4 border-t border-border">
        <h2 className="text-lg font-bold text-foreground mb-3">More like this</h2>
        <RelatedCharactersCarousel currentCharacterId={character.id} tags={character.tags || []} />
      </div>
    </div>
  );
}