import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { formatNumberWithK } from '@/lib/utils/formatting';
import { 
  MessageCircle, 
  MessageSquare,
  Heart,
  Star,
  Share2,
  Info,
  Sparkles,
  Globe,
  Lock,
  Link as LinkIcon,
  Calendar,
  TrendingUp,
  ArrowLeft,
  Loader2,
  Edit2,
  Zap
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChatCreation } from '@/hooks/useChatCreation';
import { useToast } from '@/hooks/use-toast';
import { CharacterProfileView, CharacterInteractions } from '@/data';
import { TopBar } from '@/components/ui/TopBar';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { RelatedCharactersCarousel } from '@/components/character-profile/RelatedCharactersCarousel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deletePrivateCharacter } from '@/data/characters/mutations';


// Types
interface CharacterFullData {
  id: string;
  name: string;
  tagline?: string;
  short_description?: string;
  avatar_url?: string;
  visibility: 'public' | 'unlisted' | 'private';
  interaction_count: number;
  created_at: string;
  updated_at: string;
  creator_id: string;
  was_public?: boolean; // allow delete only if false
  character_definitions: {
    greeting?: string;
    description?: string;
    personality_summary: string;
    scenario?: any;
    model_id?: string;
  };
  creator: {
    id: string;
    username: string;
    avatar_url?: string;
  };
  tags: Array<{ id: number; name: string }>;
  world_infos?: Array<{
    id: string;
    name: string;
    short_description?: string;
  }>;
  stats: {
    total_chats: number;
    total_messages: number;
    unique_users: number;
    average_rating?: number;
    total_favorites: number;
    total_likes: number;
  };
}

// Optimized data fetching hook now delegates to data layer
const useCharacterFullProfile = (characterId?: string) => {
  return useQuery({
    queryKey: ['character-full-profile', characterId],
    queryFn: async () => {
      if (!characterId) throw new Error('Character ID required');
      return CharacterProfileView.getCharacterFullProfile(characterId);
    },
    enabled: !!characterId,
    staleTime: 1000 * 60 * 5,
  });
};

// User interaction hooks
const useUserCharacterInteractions = (characterId?: string) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-character-interactions', characterId, user?.id],
    queryFn: async () => {
      if (!characterId || !user) return { isFavorited: false, isLiked: false };

      const [isFavorited, isLiked] = await Promise.all([
        CharacterInteractions.isCharacterFavorited(characterId, user.id),
        CharacterInteractions.isCharacterLiked(characterId, user.id)
      ]);
      return { isFavorited, isLiked };
    },
    enabled: !!characterId && !!user,
  });
};
export default function CharacterProfile() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { startChat, isCreating } = useChatCreation();
 
   // Add state for text expansion
   const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
   const [showDeleteDialog, setShowDeleteDialog] = useState(false);
   const [isDeleting, setIsDeleting] = useState(false);

  // Data fetching
  const { 
    data: character, 
    isLoading, 
    error 
  } = useCharacterFullProfile(characterId);
  
  const { data: interactions } = useUserCharacterInteractions(characterId);

  // Mutations
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!user || !characterId) throw new Error('Authentication required');

      if (interactions?.isFavorited) {
        await CharacterInteractions.toggleCharacterFavorite(characterId, user.id);
      } else {
        await CharacterInteractions.toggleCharacterFavorite(characterId, user.id);
      }
    },
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['character-full-profile', characterId] }),
        queryClient.cancelQueries({ queryKey: ['user-character-interactions', characterId, user?.id] }),
      ]);

      const prevCharacter = queryClient.getQueryData<CharacterFullData>(['character-full-profile', characterId]);
      const prevInteractions = queryClient.getQueryData<{ isFavorited: boolean; isLiked: boolean }>([
        'user-character-interactions',
        characterId,
        user?.id,
      ]);

      // Optimistically update favorites count and interaction flag
      if (prevCharacter) {
        const delta = prevInteractions?.isFavorited ? -1 : 1;
        queryClient.setQueryData<CharacterFullData>(['character-full-profile', characterId], {
          ...prevCharacter,
          stats: {
            ...prevCharacter.stats,
            total_favorites: Math.max(0, (prevCharacter.stats.total_favorites || 0) + delta),
          },
        });
      }
      if (prevInteractions) {
        queryClient.setQueryData(['user-character-interactions', characterId, user?.id], {
          ...prevInteractions,
          isFavorited: !prevInteractions.isFavorited,
        });
      }

      return { prevCharacter, prevInteractions } as const;
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevCharacter) {
        queryClient.setQueryData(['character-full-profile', characterId], ctx.prevCharacter);
      }
      if (ctx.prevInteractions) {
        queryClient.setQueryData(['user-character-interactions', characterId, user?.id], ctx.prevInteractions);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user-character-interactions', characterId] });
      queryClient.invalidateQueries({ queryKey: ['character-full-profile', characterId] });
      toast({
        title: interactions?.isFavorited ? 'Removed from favorites' : 'Added to favorites',
      });
    },
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !characterId) throw new Error('Authentication required');

      await CharacterInteractions.toggleCharacterLike(characterId, user.id);
    },
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['character-full-profile', characterId] }),
        queryClient.cancelQueries({ queryKey: ['user-character-interactions', characterId, user?.id] }),
      ]);

      const prevCharacter = queryClient.getQueryData<CharacterFullData>(['character-full-profile', characterId]);
      const prevInteractions = queryClient.getQueryData<{ isFavorited: boolean; isLiked: boolean }>([
        'user-character-interactions',
        characterId,
        user?.id,
      ]);

      // Optimistically update likes count and interaction flag
      if (prevCharacter) {
        const delta = prevInteractions?.isLiked ? -1 : 1;
        queryClient.setQueryData<CharacterFullData>(['character-full-profile', characterId], {
          ...prevCharacter,
          stats: {
            ...prevCharacter.stats,
            total_likes: Math.max(0, (prevCharacter.stats.total_likes || 0) + delta),
          },
        });
      }
      if (prevInteractions) {
        queryClient.setQueryData(['user-character-interactions', characterId, user?.id], {
          ...prevInteractions,
          isLiked: !prevInteractions.isLiked,
        });
      }

      return { prevCharacter, prevInteractions } as const;
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevCharacter) {
        queryClient.setQueryData(['character-full-profile', characterId], ctx.prevCharacter);
      }
      if (ctx.prevInteractions) {
        queryClient.setQueryData(['user-character-interactions', characterId, user?.id], ctx.prevInteractions);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user-character-interactions', characterId] });
      queryClient.invalidateQueries({ queryKey: ['character-full-profile', characterId] });
    },
  });

  const isOwner = user && character && character.creator_id === user.id;
  const canDelete = isOwner && character.visibility === 'private' && character.was_public !== true;

  const handleDeleteCharacter = async () => {
    if (!characterId) return;
    if (!canDelete) return;
    try {
      setIsDeleting(true);
      const { error } = await deletePrivateCharacter(characterId);
      if (error) throw error;
      toast({ title: 'Character deleted' });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'characters', user?.id] });
      setShowDeleteDialog(false);
      navigate('/characters');
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handlers
  const handleStartChat = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (character) {
      await startChat(character); // Deferred creation model
    }
  };

  const handleShare = () => {
    if (character?.visibility === 'private') {
      toast({
        title: "Cannot share",
        description: "This character is private",
        variant: "destructive"
      });
      return;
    }

    const url = `${window.location.origin}/character/${characterId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Character profile link copied to clipboard",
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar 
          title="Loading..."
          subtitle="Please wait"
        />
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
          <CharacterProfileSkeleton />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !character) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar title="Character Not Found" />
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md w-full">
            <CardContent className="text-center py-8">
              <Info className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Character Not Found</h3>
              <p className="text-muted-foreground mb-4">
                This character may have been deleted or you don't have permission to view it.
              </p>
              <Button onClick={() => navigate('/discover')} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Discover
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Check if character is accessible for public viewing
  if (character.visibility === 'private' && (!user || character.creator_id !== user.id)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar title="Private Character" />
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md w-full">
            <CardContent className="text-center py-8">
              <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Private Character</h3>
              <p className="text-muted-foreground mb-4">
                This character is private and can only be accessed by its creator.
              </p>
              <Button onClick={() => navigate('/discover')} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Discover
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const visibilityIcon = {
    public: <Globe className="w-4 h-4" />,
    unlisted: <LinkIcon className="w-4 h-4" />,
    private: <Lock className="w-4 h-4" />
  }[character.visibility];

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={character.name}
        subtitle={character.tagline || 'AI Character'}
        leftContent={
          <Button
            onClick={() => navigate(-1)}
            variant="ghost"
            size="sm"
            className="hidden md:flex"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        }
        rightContent={
          isOwner && (
            <div className="flex gap-2">
              <Button
                onClick={() => navigate('/character-creator', { 
                  state: { editingCharacter: character, isEditing: true } 
                })}
                variant="outline"
                size="sm"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
              {canDelete && (
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                   Delete
                 </Button>
               )}
            </div>
          )
        }
      />

      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Character Card */}
          <Card className="lg:col-span-9 overflow-hidden">
            <div className="relative">
              {/* Background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
              
              <CardContent className="relative p-6 md:p-8">
                {/* Character Name at the top */}
                <div className="mb-6">
                  <div className="flex items-start justify-between">
                    <h1 className="text-2xl md:text-3xl font-bold">{character.name}</h1>
                    <Badge variant="outline" className="ml-2">
                      {visibilityIcon}
                      <span className="ml-1">{character.visibility}</span>
                    </Badge>
                  </div>
                  {character.tagline && (
                    <p className="text-lg text-muted-foreground mt-1">{character.tagline}</p>
                  )}
                </div>

                {/* Avatar and Info side by side */}
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Avatar - Character Card Dimensions (4:5 ratio) - Increased sizes */}
                  <div className="flex-shrink-0 mx-auto md:mx-0">
                    <div className="relative w-84 h-105 md:w-67 md:h-84 rounded-lg overflow-hidden shadow-xl ring-4 ring-background">
                      {character.avatar_url ? (
                        <img 
                          src={character.avatar_url} 
                          alt={character.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                          <span className="text-6xl md:text-7xl font-bold text-primary">
                            {character.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Character Info - Height adjusted to match new avatar */}
                  <div className="flex-1 flex flex-col justify-between h-auto md:h-84">
                    <div className="space-y-4">
                      {character.short_description && (
                        <div>
                          <p className={cn(
                            "text-muted-foreground transition-all duration-300",
                            !isDescriptionExpanded && "line-clamp-4 md:line-clamp-8"
                          )}>
                            {character.short_description}
                          </p>
                          {character.short_description.length > 200 && (
                            <button
                              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                              className="text-primary hover:text-primary/80 text-sm font-medium mt-1 transition-colors"
                            >
                              {isDescriptionExpanded ? 'See less' : 'See more'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Tags */}
                      {character.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {character.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag.id} variant="secondary" className="text-xs">
                              {tag.name}
                            </Badge>
                          ))}
                          {character.tags.length > 5 && (
                            <Badge variant="secondary" className="text-xs">
                              +{character.tags.length - 5} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Creator Info - Positioned at bottom */}
                    <div className="flex items-center gap-3 pt-2 mt-auto">
                      <Link 
                        to={`/profile/${character.creator.username}`}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={character.creator.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {character.creator.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground">
                          by <span className="font-medium">{character.creator.username}</span>
                        </span>
                      </Link>
                      
                      <Separator orientation="vertical" className="h-4" />
                      
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDistanceToNow(new Date(character.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleStartChat}
                    disabled={isCreating}
                    className="flex-1 sm:flex-initial h-14 sm:h-11 text-base sm:text-sm"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Chat...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Start Chatting
                      </>
                    )}
                  </Button>

                  {/* Mobile-only Edit button for owners */}
                  {isOwner && (
                    <Button
                      onClick={() => navigate('/character-creator', { state: { editingCharacter: character, isEditing: true } })}
                      variant="outline"
                      className="sm:hidden h-12 text-base"
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit Character
                    </Button>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => user ? toggleFavoriteMutation.mutate() : navigate('/auth')}
                      variant={interactions?.isFavorited ? "default" : "outline"}
                      size="lg"
                      disabled={toggleFavoriteMutation.isPending}
                    >
                      <Star className={cn(
                        "w-4 h-4",
                        interactions?.isFavorited && "fill-current"
                      )} />
                    </Button>

                    <Button
                      onClick={() => user ? toggleLikeMutation.mutate() : navigate('/auth')}
                      variant={interactions?.isLiked ? "default" : "outline"}
                      size="lg"
                      disabled={toggleLikeMutation.isPending}
                    >
                      <Heart className={cn(
                        "w-4 h-4",
                        interactions?.isLiked && "fill-current"
                      )} />
                    </Button>

                    <Button
                      onClick={handleShare}
                      variant="outline"
                      size="lg"
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </div>
          </Card>

          {/* Enhanced Stats Card */}
          <Card className="lg:col-span-3 overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-primary/10 to-transparent p-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-4 h-4" />
                Character Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Engagement Score */}
              <div className="space-y-2">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-muted-foreground">Engagement Score</span>
                  <span className="text-xl font-bold text-primary">
                    {Math.min(100, Math.round(
                      (character.stats.total_chats * 0.3 + 
                       character.stats.total_likes * 0.4 + 
                       character.stats.total_favorites * 0.3) / 10
                    ))}%
                  </span>
                </div>
                <Progress value={Math.min(100, Math.round(
                  (character.stats.total_chats * 0.3 + 
                   character.stats.total_likes * 0.4 + 
                   character.stats.total_favorites * 0.3) / 10
                ))} className="h-2" />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-primary/5 rounded-lg p-3 text-center hover:bg-primary/10 transition-colors">
                  <MessageCircle className="w-6 h-6 mx-auto mb-1 text-primary" />
                  <div className="text-lg font-bold">{formatNumberWithK(character.stats.total_chats)}</div>
                  <div className="text-xs text-muted-foreground">Chats</div>
                </div>

                <div className="bg-primary/5 rounded-lg p-3 text-center hover:bg-primary/10 transition-colors">
                  <MessageSquare className="w-6 h-6 mx-auto mb-1 text-primary" />
                  <div className="text-lg font-bold">{formatNumberWithK(character.stats.total_messages)}</div>
                  <div className="text-xs text-muted-foreground">Messages</div>
                </div>

                <div className="bg-primary/5 rounded-lg p-3 text-center hover:bg-primary/10 transition-colors">
                  <Heart className="w-6 h-6 mx-auto mb-1 text-primary" />
                  <div className="text-lg font-bold">{formatNumberWithK(character.stats.total_likes)}</div>
                  <div className="text-xs text-muted-foreground">Likes</div>
                </div>

                <div className="bg-primary/5 rounded-lg p-3 text-center hover:bg-primary/10 transition-colors">
                  <Star className="w-6 h-6 mx-auto mb-1 text-primary" />
                  <div className="text-lg font-bold">{formatNumberWithK(character.stats.total_favorites)}</div>
                  <div className="text-xs text-muted-foreground">Favs</div>
                </div>
              </div>

              {/* Activity Level */}
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Activity</span>
                  <Badge variant="secondary" className="bg-primary/20 text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    {character.stats.total_chats > 1000 ? 'Very Active' : 
                     character.stats.total_chats > 100 ? 'Active' : 'Growing'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Character Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Character Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Scenario */}
            {character.character_definitions.scenario && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Scenario
                </h3>
                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <p className="text-sm whitespace-pre-wrap">
                      {typeof character.character_definitions.scenario === 'string' 
                        ? character.character_definitions.scenario 
                        : JSON.stringify(character.character_definitions.scenario, null, 2)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Greeting Message */}
            {character.character_definitions.greeting && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Greeting Message
                </h3>
                <Card className="bg-muted/50 border-primary/20">
                  <CardContent className="p-4">
                    <p className="italic">{character.character_definitions.greeting}</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Related Characters Carousel */}
        {character.tags.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Recommended Characters</h2>
            <p className="text-muted-foreground">Characters with similar interests</p>
            <RelatedCharactersCarousel 
              currentCharacterId={character.id} 
              tags={character.tags}
            />
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this character?</DialogTitle>
          </DialogHeader>
          <p>
            This action will permanently delete this character and also remove your chats with them.
            This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end mt-4">
            <Button onClick={() => setShowDeleteDialog(false)} variant="outline" disabled={isDeleting}>Cancel</Button>
            <Button onClick={handleDeleteCharacter} variant="destructive" disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper Components
function CharacterProfileSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-9">
          <CardContent className="p-8">
            {/* Name section skeleton */}
            <div className="space-y-2 mb-6">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-5 w-64" />
            </div>
            
            {/* Avatar and info skeleton */}
            <div className="flex gap-6">
              <Skeleton className="w-84 h-105 md:w-67 md:h-84 rounded-lg" />
              <div className="flex-1 h-auto md:h-84 flex flex-col justify-between">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
                <Skeleton className="h-6 w-48" />
              </div>
            </div>
            
            {/* Action buttons skeleton */}
            <div className="mt-6 flex gap-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-10 w-10" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
          <CardContent className="p-4 space-y-4">
            <Skeleton className="h-6 w-full" />
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </>
  );
}