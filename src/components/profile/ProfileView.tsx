import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { 
  User, 
  Calendar, 
  MessageCircle, 
  Heart, 
  Sparkles, 
  Settings,
  Clock,
  MoreVertical,
  Users,
  Shield,
  Share2,
  Flag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TopBar } from '@/components/ui/TopBar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  getPublicProfile, 
  getUserCharacters, 
  getUserFavorites,
  getUserActiveSubscription,
  getUserPersonasForProfile
} from '@/lib/supabase-queries';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserProfileData {
  profile: any;
  characters: any[];
  favorites: any[];
  personas: any[];
  subscription: any;
  stats: {
    totalChats: number;
    totalCharacters: number;
    totalFavorites: number;
    totalPersonas: number;
    memberSince: string;
  };
}

// Consolidated data fetching hook
const useUserProfileData = (userId: string, isOwnProfile: boolean) => {
  return useQuery({
    queryKey: ['user-profile-complete', userId],
    queryFn: async () => {
      try {
        // Parallel fetch all data
        const promises = [
          getPublicProfile(userId),
          getUserCharacters(userId),
          getUserFavorites(userId),
          getUserActiveSubscription(userId),
          supabase
            .from('chats')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
        ];

        // Only fetch personas for own profile
        if (isOwnProfile) {
          promises.push(getUserPersonasForProfile(userId));
        }

        const results = await Promise.allSettled(promises);

        // Extract results with proper type checking
        const profile = results[0].status === 'fulfilled' && results[0].value.data ? results[0].value.data : null;
        const characters = results[1].status === 'fulfilled' && Array.isArray(results[1].value.data) ? results[1].value.data : [];
        const favorites = results[2].status === 'fulfilled' && Array.isArray(results[2].value.data) ? results[2].value.data : [];
        const subscription = results[3].status === 'fulfilled' && results[3].value.data ? results[3].value.data : null;
        
        // Chat count extraction - need to check the structure
        let chatCount = 0;
        if (results[4].status === 'fulfilled' && results[4].value && 'count' in results[4].value) {
          chatCount = results[4].value.count || 0;
        }
        
        const personas = isOwnProfile && results[5] && results[5].status === 'fulfilled' && Array.isArray(results[5].value.data) ? results[5].value.data : [];

        return {
          profile,
          characters,
          favorites,
          personas,
          subscription,
          stats: {
            totalChats: chatCount,
            totalCharacters: characters.length,
            totalFavorites: favorites.length,
            totalPersonas: personas.length,
            memberSince: (profile && typeof profile === 'object' && 'created_at' in profile) ? profile.created_at : new Date().toISOString()
          }
        } as UserProfileData;
      } catch (error) {
        console.error('Error fetching profile data:', error);
        throw error;
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const ProfileView = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('characters');

  const isOwnProfile = !userId || user?.id === userId;
  const profileUserId = userId || user?.id;

  // For public profile access, don't redirect to auth if no user is logged in
  const shouldRedirectToAuth = !profileUserId && !userId;

  const { data, isLoading, error } = useUserProfileData(profileUserId!, isOwnProfile);

  if (shouldRedirectToAuth) {
    navigate('/auth');
    return null;
  }

  if (!profileUserId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">User not found</p>
            <Button onClick={() => navigate('/')} className="mt-4">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">Failed to load profile</p>
            <Button onClick={() => navigate(-1)} className="mt-4">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleShare = () => {
    const url = `${window.location.origin}/profile/${profileUserId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Profile link copied!",
      description: "Share this link with others to show your profile.",
    });
  };

  const StatCard = ({ icon: Icon, label, value, color = "text-primary" }: any) => (
    <Card className="bg-card/50 border-border/50 hover:bg-card/80 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-primary/10`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const CharacterCard = ({ character }: any) => (
    <Card 
      className="group cursor-pointer hover:shadow-lg transition-all duration-200 bg-card/50 hover:bg-card/80"
      onClick={() => navigate(`/character/${character.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16 ring-2 ring-border group-hover:ring-primary transition-all">
            <AvatarImage src={character.avatar_url} alt={character.name} />
            <AvatarFallback>{character.name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {character.name}
            </h4>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {character.short_description || character.tagline}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />
                {character.actual_chat_count || 0}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="w-3 h-3" />
                {character.likes_count || 0}
              </span>
              <Badge variant={character.visibility === 'public' ? 'default' : 'secondary'} className="text-xs">
                {character.visibility}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const PersonaCard = ({ persona }: any) => (
    <Card className="bg-card/50 hover:bg-card/80 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="w-12 h-12">
            <AvatarImage src={persona.avatar_url} />
            <AvatarFallback>
              <User className="w-6 h-6" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h4 className="font-semibold">{persona.name}</h4>
            {persona.bio && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {persona.bio}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={isOwnProfile ? "My Profile" : `${data?.profile?.username || 'User'}'s Profile`}
        rightContent={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleShare}
              variant="ghost"
              size="sm"
            >
              <Share2 className="w-4 h-4" />
            </Button>
            {isOwnProfile && (
              <Button
                onClick={() => navigate('/profile/settings')}
                variant="outline"
                size="sm"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            )}
            {!isOwnProfile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Flag className="w-4 h-4 mr-2" />
                    Report User
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              {isLoading ? (
                <>
                  <Skeleton className="w-24 h-24 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-4 w-96" />
                  </div>
                </>
              ) : (
                <>
                  <Avatar className="w-24 h-24 ring-4 ring-primary/20">
                    <AvatarImage src={data?.profile?.avatar_url} alt={data?.profile?.username} />
                    <AvatarFallback className="text-2xl">
                      {data?.profile?.username?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                      <h1 className="text-3xl font-bold">@{data?.profile?.username || 'Anonymous'}</h1>
                      {data?.subscription && (
                        <Badge variant="secondary" className="w-fit mx-auto md:mx-0">
                          <Shield className="w-3 h-3 mr-1" />
                          {data.subscription.plan.name}
                        </Badge>
                      )}
                    </div>
                    
                    {data?.profile?.bio && (
                      <p className="text-muted-foreground mb-4 max-w-2xl">
                        {data.profile.bio}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground justify-center md:justify-start">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Member since {format(new Date(data?.stats.memberSince || Date.now()), 'MMMM yyyy')}
                      </span>
                      {data?.profile?.timezone && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {data.profile.timezone}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : (
            <>
              <StatCard 
                icon={MessageCircle} 
                label="Total Chats" 
                value={data?.stats.totalChats || 0} 
              />
              <StatCard 
                icon={Sparkles} 
                label="Characters" 
                value={data?.stats.totalCharacters || 0} 
              />
              <StatCard 
                icon={Heart} 
                label="Favorites" 
                value={data?.stats.totalFavorites || 0} 
              />
              <StatCard 
                icon={Users} 
                label="Personas" 
                value={data?.stats.totalPersonas || 0} 
              />
            </>
          )}
        </div>

        {/* Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-grid">
            <TabsTrigger value="characters">
              Characters ({data?.characters?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="favorites">
              Favorites ({data?.favorites?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="personas">
              Personas ({data?.personas?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="characters" className="space-y-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array(4).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : data?.characters?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No characters created yet</p>
                  {isOwnProfile && (
                    <Button onClick={() => navigate('/character-creator')} className="mt-4">
                      Create Your First Character
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.characters.map((character) => (
                  <CharacterCard key={character.id} character={character} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="favorites" className="space-y-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array(4).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : data?.favorites?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Heart className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No favorite characters yet</p>
                  {isOwnProfile && (
                    <Button onClick={() => navigate('/discover')} className="mt-4">
                      Discover Characters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.favorites.map((character) => (
                  <CharacterCard key={character.id} character={character} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="personas" className="space-y-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array(3).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : !isOwnProfile ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Personas are private</p>
                </CardContent>
              </Card>
            ) : data?.personas?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No personas created yet</p>
                  <Button onClick={() => navigate('/profile/settings')} className="mt-4">
                    Create Your First Persona
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.personas.map((persona) => (
                  <PersonaCard key={persona.id} persona={persona} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};