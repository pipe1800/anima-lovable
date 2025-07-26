import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { 
  Heart,
  Eye,
  Calendar,
  ArrowLeft,
  Loader2,
  BookOpen,
  Search,
  Download,
  Edit2
} from 'lucide-react';
import { TopBar } from '@/components/ui/TopBar';
import { supabase } from '@/integrations/supabase/client';
import { getPublicWorldInfoDetails } from '@/lib/world-info-operations';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface WorldInfoData {
  id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  interaction_count: number;
  created_at: string;
  creator_id: string;
  visibility: string;
  entries: Array<{
    id: string;
    keywords: string[];
    entry_text: string;
    created_at: string;
  }>;
  tags: Array<{
    id: number;
    name: string;
  }>;
  creator: {
    username: string;
    avatar_url: string | null;
  } | null;
  isLiked: boolean;
  isUsed: boolean;
  likesCount: number;
}

export default function PublicWorldInfoProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Main data
  const [worldInfo, setWorldInfo] = useState<WorldInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Interaction states
  const [isLiking, setIsLiking] = useState(false);
  const [isUsingLorebook, setIsUsingLorebook] = useState(false);
  const [entriesSearchQuery, setEntriesSearchQuery] = useState('');
  const [similarWorldInfos, setSimilarWorldInfos] = useState<any[]>([]);

  // Permission checks
  const isOwner = user && worldInfo && worldInfo.creator_id === user.id;
  const canEdit = isOwner || (user && worldInfo && worldInfo.isUsed);

  useEffect(() => {
    const fetchWorldInfoData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const data = await getPublicWorldInfoDetails(id);
        setWorldInfo(data as unknown as WorldInfoData);
        
        // Fetch similar world infos
        if (data.tags && data.tags.length > 0) {
          const tagIds = data.tags.map(tag => tag.id);
          const { data: similarData } = await supabase
            .from('world_infos')
            .select(`
              id,
              name,
              short_description,
              avatar_url,
              creator:profiles!creator_id(username)
            `)
            .eq('visibility', 'public')
            .neq('id', data.id)
            .in('id', 
              await supabase
                .from('world_info_tags')
                .select('world_info_id')
                .in('tag_id', tagIds)
                .then(({ data }) => data?.map(d => d.world_info_id) || [])
            )
            .limit(6);
          
          setSimilarWorldInfos(similarData || []);
        }
      } catch (err) {
        console.error('Error fetching world info:', err);
        setError('Failed to load world info');
      } finally {
        setLoading(false);
      }
    };

    fetchWorldInfoData();
  }, [id]);

  const handleLike = async () => {
    if (!worldInfo || isLiking) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to like this world info",
        variant: "destructive"
      });
      return;
    }

    setIsLiking(true);
    try {
      if (worldInfo.isLiked) {
        // Remove like
        const { error } = await supabase
          .from('world_info_likes')
          .delete()
          .eq('world_info_id', worldInfo.id)
          .eq('user_id', user.user.id);

        if (error) throw error;

        setWorldInfo(prev => prev ? {
          ...prev,
          isLiked: false,
          likesCount: prev.likesCount - 1
        } : null);
      } else {
        // Add like
        const { error } = await supabase
          .from('world_info_likes')
          .insert({
            world_info_id: worldInfo.id,
            user_id: user.user.id
          });

        if (error) throw error;

        setWorldInfo(prev => prev ? {
          ...prev,
          isLiked: true,
          likesCount: prev.likesCount + 1
        } : null);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update like status",
        variant: "destructive"
      });
    } finally {
      setIsLiking(false);
    }
  };

  const handleUseLorebook = async () => {
    if (!worldInfo || isUsingLorebook) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to use this lorebook",
        variant: "destructive"
      });
      return;
    }

    setIsUsingLorebook(true);
    try {
      if (worldInfo.isUsed) {
        // Remove from collection
        const { error } = await supabase
          .from('world_info_users')
          .delete()
          .eq('world_info_id', worldInfo.id)
          .eq('user_id', user.user.id);

        if (error) throw error;

        setWorldInfo(prev => prev ? {
          ...prev,
          isUsed: false
        } : null);

        toast({
          title: "Lorebook Removed",
          description: "This lorebook has been removed from your collection",
        });
      } else {
        // Add to collection
        const { error } = await supabase
          .from('world_info_users')
          .insert({
            world_info_id: worldInfo.id,
            user_id: user.user.id
          });

        if (error) throw error;

        setWorldInfo(prev => prev ? {
          ...prev,
          isUsed: true
        } : null);

        toast({
          title: "Lorebook Added",
          description: "This lorebook has been added to your collection",
        });
      }
    } catch (error) {
      console.error('Error toggling lorebook usage:', error);
      toast({
        title: "Error",
        description: "Failed to update lorebook collection",
        variant: "destructive"
      });
    } finally {
      setIsUsingLorebook(false);
    }
  };

  const handleEdit = () => {
    if (!id) return;
    navigate(`/world-info-editor/${id}`);
  };

  // Filter entries based on search term
  const filteredEntries = worldInfo?.entries.filter(entry => {
    if (!entriesSearchQuery) return true;
    const searchLower = entriesSearchQuery.toLowerCase();
    return (
      entry.keywords.some(keyword => keyword.toLowerCase().includes(searchLower)) ||
      entry.entry_text.toLowerCase().includes(searchLower)
    );
  }) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !worldInfo) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4 text-white">World Info Not Found</h2>
          <p className="text-gray-400 mb-4">{error || 'The world info you are looking for does not exist or is not public.'}</p>
          <Button onClick={() => navigate('/')} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      <TopBar
        title="World Info Details"
        rightContent={
          canEdit && (
            <Button
              onClick={() => navigate(`/world-info/${id}/edit`)}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )
        }
      />
      
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Back button under TopBar */}
          <div className="p-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/world-info')}
              className="text-gray-400 hover:text-white mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to World Info
            </Button>
          
            {/* Header */}
            <div className="border-b border-gray-700/50 pb-6">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">
                  {worldInfo.name}
                </h1>
                <div className="flex gap-2">
                  {/* Action Buttons */}
                  <Button
                    onClick={handleLike}
                    variant={worldInfo.isLiked ? "default" : "outline"}
                    disabled={isLiking}
                    className="border-gray-600"
                  >
                    <Heart className={`mr-2 h-4 w-4 ${worldInfo.isLiked ? 'fill-current' : ''}`} />
                    {worldInfo.likesCount} Likes
                  </Button>
                  {/* Only show Add to Collection if user is not the owner */}
                  {!isOwner && (
                    <Button
                      onClick={handleUseLorebook}
                      variant={worldInfo.isUsed ? "outline" : "secondary"}
                      disabled={isUsingLorebook}
                      className="border-gray-600"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {worldInfo.isUsed ? "Remove from Collection" : "Add to Collection"}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      onClick={handleEdit}
                      variant="outline"
                      className="border-gray-600 text-gray-300 hover:bg-gray-800"
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* World Info Details Card */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <BookOpen className="w-5 h-5" />
                    World Info Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Header Section */}
                  <div className="flex items-start gap-6">
                    <div className="relative">
                      <Avatar className="h-24 w-24">
                        {worldInfo.avatar_url ? (
                          <AvatarImage src={worldInfo.avatar_url} alt="World Info Avatar" />
                        ) : (
                          <AvatarFallback className="bg-gray-700 text-gray-300">
                            <BookOpen className="w-8 h-8" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                    </div>
                    <div className="flex-1">
                      <h1 className="text-4xl font-bold mb-2 text-white">{worldInfo.name}</h1>
                      <p className="text-gray-400 mb-4">
                        Created by{' '}
                        <Link
                          to={`/profile/${worldInfo.creator_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {worldInfo.creator?.username || 'Unknown'}
                        </Link>
                      </p>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(worldInfo.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Eye className="h-4 w-4" />
                          {worldInfo.interaction_count} views
                        </div>
                      </div>
                      {worldInfo.short_description && (
                        <p className="text-lg text-gray-300 mt-4">{worldInfo.short_description}</p>
                      )}
                    </div>
                  </div>

                  {/* Tags Section */}
                  <Separator className="bg-gray-700" />
                  {worldInfo.tags.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {worldInfo.tags.map((tag) => (
                          <Badge key={tag.id} variant="secondary" className="bg-gray-700 text-gray-300">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Lorebook Entries */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <BookOpen className="w-5 h-5" />
                    Lorebook Entries ({worldInfo.entries.length})
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search entries by keyword..."
                      value={entriesSearchQuery}
                      onChange={(e) => setEntriesSearchQuery(e.target.value)}
                      className="pl-10 bg-gray-800/50 border-gray-600 text-white"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Entries List */}
                  {filteredEntries.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">
                      {entriesSearchQuery ? 'No entries match your search.' : 'No lorebook entries found.'}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {filteredEntries.map((entry) => (
                        <Card key={entry.id} className="bg-gray-700/50 border-gray-600">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-1">
                                {entry.keywords.map((keyword, index) => (
                                  <Badge key={index} variant="outline" className="text-xs border-gray-500 text-gray-300">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                              <p className="text-sm text-gray-300 whitespace-pre-wrap">{entry.entry_text}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Similar World Infos */}
              {similarWorldInfos.length > 0 && (
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Similar World Infos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {similarWorldInfos.map((similarWorldInfo) => (
                        <Link
                          key={similarWorldInfo.id}
                          to={`/world-info-view/${similarWorldInfo.id}`}
                          className="block border border-gray-700 rounded-lg p-4 hover:bg-gray-700/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-gray-700 text-gray-300">
                                <BookOpen className="w-6 h-6" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate text-white">{similarWorldInfo.name}</h4>
                              <p className="text-sm text-gray-400 truncate">
                                by {similarWorldInfo.creator?.username || 'Unknown'}
                              </p>
                              {similarWorldInfo.short_description && (
                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                  {similarWorldInfo.short_description}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}