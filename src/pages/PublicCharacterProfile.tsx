import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TopBar } from '@/components/ui/TopBar';
import { PublicNavigation } from '@/components/ui/PublicNavigation';
import { formatNumberWithK } from '@/lib/utils/formatting';
import { 
  MessageCircle, 
  Heart,
  Eye,
  Calendar,
  User,
  Star,
  ArrowLeft,
  Loader2,
  TrendingUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { RelatedCharactersCarousel } from '@/components/character-profile/RelatedCharactersCarousel';

interface CharacterData {
  id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  interaction_count: number;
  created_at: string;
  creator_id: string;
  visibility: string;
  character_definitions?: {
    personality_summary: string;
    description: string | null;
    greeting: string | null;
  };
  creator?: {
    username: string;
    avatar_url: string | null;
  };
  tags?: Array<{ id: number; name: string }>;
  actual_chat_count?: number;
  likes_count?: number;
}

export default function PublicCharacterProfile() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCharacterData = async () => {
      if (!characterId) {
        setError('Character ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch character with definitions and tags
        const { data: characterData, error: characterError } = await supabase
          .from('characters')
          .select(`
            *,
            character_definitions(*),
            character_tags(tag:tags(id, name))
          `)
          .eq('id', characterId)
          .eq('visibility', 'public')
          .single();

        if (characterError) {
          console.error('Error fetching character:', characterError);
          setError('Character not found or not public');
          setLoading(false);
          return;
        }

        // Fetch creator profile separately
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', characterData.creator_id)
          .single();

        // Get chat count
        const { count: chatCount } = await supabase
          .from('chats')
          .select('*', { count: 'exact' })
          .eq('character_id', characterId);

        // Get likes count
        const { count: likesCount } = await supabase
          .from('character_likes')
          .select('*', { count: 'exact' })
          .eq('character_id', characterId);

        setCharacter({
          ...characterData,
          creator: creatorProfile || { username: 'Unknown', avatar_url: null },
          tags: characterData.character_tags?.map((t: any) => t.tag).filter(Boolean) || [],
          actual_chat_count: chatCount || 0,
          likes_count: likesCount || 0
        });

      } catch (err) {
        console.error('Error:', err);
        setError('Failed to load character');
      } finally {
        setLoading(false);
      }
    };

    fetchCharacterData();
  }, [characterId]);

  const handleSignupToChat = () => {
    navigate('/auth?mode=signup');
  };

  const handleLoginToLike = () => {
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212]">
        {/* Standardized TopBar */}
        <TopBar
          title="Loading Character..."
          leftContent={<PublicNavigation />}
          className="bg-[#1a1a2e]/95 backdrop-blur-sm"
        />

        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
            <span className="text-white">Loading character...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="min-h-screen bg-[#121212]">
        {/* Standardized TopBar */}
        <TopBar
          title="Character Not Found"
          subtitle="The character you're looking for might not exist or is not public"
          leftContent={<PublicNavigation />}
          className="bg-[#1a1a2e]/95 backdrop-blur-sm"
        />
        
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-red-400 text-lg mb-2">{error}</div>
            <Button onClick={() => navigate('/characters')} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Characters
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      {/* Standardized TopBar */}
      <TopBar
        title={character?.name || "Character Profile"}
        subtitle={character?.short_description || "View character details and start chatting"}
        leftContent={<PublicNavigation />}
        rightContent={
          <Button
            onClick={() => navigate('/characters')}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Back to Characters</span>
            <span className="sm:hidden">Back</span>
          </Button>
        }
        className="bg-[#1a1a2e]/95 backdrop-blur-sm"
      />

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8 space-y-8">{/* Character Hero Section */}
        <Card className="bg-[#1a1a2e] border-gray-700/50 overflow-hidden">
          <div className="relative">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/20 via-[#FF7A00]/10 to-transparent" />
            
            <CardContent className="relative p-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:space-x-8 space-y-6 lg:space-y-0">
                {/* Avatar */}
                <div className="flex justify-center lg:justify-start">
                  <Avatar className="w-32 h-32 ring-4 ring-[#FF7A00]/50">
                    <AvatarImage src={character.avatar_url || "/placeholder.svg"} alt={character.name} />
                    <AvatarFallback className="bg-gradient-to-br from-[#FF7A00] to-[#FF7A00]/70 text-white font-bold text-4xl">
                      {character.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Character Info */}
                <div className="flex-1 text-center lg:text-left">
                  <h1 className="text-4xl font-bold text-white mb-2">{character.name}</h1>
                  
                  {character.short_description && (
                    <p className="text-gray-300 text-lg mb-4 leading-relaxed">
                      {character.short_description}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="flex flex-wrap justify-center lg:justify-start gap-6 mb-6">
                    <div className="flex items-center space-x-2 text-gray-300">
                      <MessageCircle className="w-5 h-5 text-[#FF7A00]" />
                      <span className="font-semibold">{formatNumberWithK(character.actual_chat_count || 0)}</span>
                      <span className="text-sm">conversations</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Heart className="w-5 h-5 text-[#FF7A00]" />
                      <span className="font-semibold">{formatNumberWithK(character.likes_count || 0)}</span>
                      <span className="text-sm">likes</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Calendar className="w-5 h-5 text-[#FF7A00]" />
                      <span className="text-sm">Created {new Date(character.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Creator */}
                  <div className="flex items-center justify-center lg:justify-start space-x-3 mb-6">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-400">Created by</span>
                    <div className="flex items-center space-x-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={character.creator?.avatar_url || "/placeholder.svg"} />
                        <AvatarFallback className="bg-[#FF7A00] text-white text-xs">
                          {character.creator?.username?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[#FF7A00] font-medium">@{character.creator?.username || 'Unknown'}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                    <Button
                      onClick={handleSignupToChat}
                      className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-bold px-8 py-3"
                    >
                      <MessageCircle className="w-5 h-5 mr-2" />
                      Signup to Chat
                    </Button>
                    <Button
                      onClick={handleLoginToLike}
                      variant="outline"
                      className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent px-8 py-3"
                    >
                      <Heart className="w-5 h-5 mr-2" />
                      Login to Like
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Character Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Greeting */}
            {character.character_definitions?.greeting && (
              <Card className="bg-[#1a1a2e] border-gray-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <MessageCircle className="w-5 h-5 mr-2 text-[#FF7A00]" />
                    Character Greeting
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 leading-relaxed italic">
                    "{character.character_definitions.greeting}"
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Character Description */}
            {character.character_definitions?.description && (
              <Card className="bg-[#1a1a2e] border-gray-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Eye className="w-5 h-5 mr-2 text-[#FF7A00]" />
                    Character Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {character.character_definitions.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Character Personality Summary */}
            {character.character_definitions?.personality_summary && (
              <Card className="bg-[#1a1a2e] border-gray-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Star className="w-5 h-5 mr-2 text-[#FF7A00]" />
                    Character Personality
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {character.character_definitions.personality_summary}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card className="bg-[#1a1a2e] border-gray-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-[#FF7A00]" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Conversations</span>
                  <Badge variant="secondary" className="bg-[#FF7A00]/20 text-[#FF7A00]">
                    {formatNumberWithK(character.actual_chat_count || 0)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Likes</span>
                  <Badge variant="secondary" className="bg-[#FF7A00]/20 text-[#FF7A00]">
                    {formatNumberWithK(character.likes_count || 0)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Visibility</span>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                    Public
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Created</span>
                  <span className="text-gray-300 text-sm">
                    {new Date(character.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Call to Action */}
            <Card className="bg-gradient-to-br from-[#FF7A00]/20 to-[#FF7A00]/10 border-[#FF7A00]/30">
              <CardContent className="p-6 text-center">
                <h3 className="text-white font-bold text-lg mb-2">Ready to Chat?</h3>
                <p className="text-gray-300 text-sm mb-4">
                  Join thousands of users creating amazing conversations with AI characters.
                </p>
                <Button
                  onClick={handleSignupToChat}
                  className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-bold"
                >
                  Get Started Free
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Related Characters Carousel */}
        {character.tags && character.tags.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Recommended Characters</h2>
            <p className="text-gray-300">Characters with similar interests</p>
            <RelatedCharactersCarousel 
              currentCharacterId={character.id} 
              tags={character.tags}
            />
          </div>
        )}
      </div>
    </div>
  );
}