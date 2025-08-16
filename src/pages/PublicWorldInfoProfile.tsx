import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  Edit2,
  Trash2,
  Globe,
  Lock
} from 'lucide-react';
import { PublicTopBar } from '@/components/ui/PublicTopBar';
import { supabase } from '@/integrations/supabase/client';
import { getPublicWorldInfoDetails, addWorldInfoToCollection, removeWorldInfoFromCollection } from '@/lib/world-info-operations';
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
  const canEdit = isOwner;

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
          
          // First get world info IDs that have similar tags
          const { data: taggedWorldInfos } = await supabase
            .from('world_info_tags')
            .select('world_info_id')
            .in('tag_id', tagIds);
          
          const similarWorldInfoIds = taggedWorldInfos
            ?.map(d => d.world_info_id)
            .filter(wid => wid !== data.id) || []; // Exclude current world info
          
          if (similarWorldInfoIds.length > 0) {
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
              .in('id', similarWorldInfoIds)
              .limit(6);
            
            setSimilarWorldInfos(similarData || []);
          }
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
          .from('world_info_user_likes')
          .delete()
          .eq('world_info_id', worldInfo.id)
          .eq('user_id', user.user.id);

        if (error) throw error;

        // Update likes_count in world_infos table
        const { data: currentData } = await supabase
          .from('world_infos')
          .select('likes_count')
          .eq('id', worldInfo.id)
          .single();
        
        if (currentData) {
          await supabase
            .from('world_infos')
            .update({ likes_count: Math.max(currentData.likes_count - 1, 0) })
            .eq('id', worldInfo.id);
        }

        setWorldInfo(prev => prev ? {
          ...prev,
          isLiked: false,
          likesCount: prev.likesCount - 1
        } : null);
      } else {
        // Add like
        const { error } = await supabase
          .from('world_info_user_likes')
          .insert({
            world_info_id: worldInfo.id,
            user_id: user.user.id
          });

        if (error) throw error;

        // Update likes_count in world_infos table
        const { data: currentData } = await supabase
          .from('world_infos')
          .select('likes_count')
          .eq('id', worldInfo.id)
          .single();
        
        if (currentData) {
          await supabase
            .from('world_infos')
            .update({ likes_count: currentData.likes_count + 1 })
            .eq('id', worldInfo.id);
        }

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
    if (!user || !worldInfo) return;
    
    setIsUsingLorebook(true);
    
    try {
      if (worldInfo.isUsed) {
        // Use the proper function that handles interaction count
        await removeWorldInfoFromCollection(worldInfo.id);
        
        setWorldInfo(prev => prev ? {
          ...prev,
          isUsed: false,
          interaction_count: Math.max((prev.interaction_count || 0) - 1, 0)
        } : null);

        toast({
          title: "Lorebook Removed",
          description: "This lorebook has been removed from your collection",
        });
      } else {
        // Use the proper function that handles interaction count
        await addWorldInfoToCollection(worldInfo.id);
        
        setWorldInfo(prev => prev ? {
          ...prev,
          isUsed: true,
          interaction_count: (prev.interaction_count || 0) + 1
        } : null);

        toast({
          title: "Lorebook Added",
          description: "This lorebook has been added to your collection",
        });
      }
    } catch (error) {
      console.error('Error updating lorebook collection:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update collection",
        variant: "destructive",
      });
    } finally {
      setIsUsingLorebook(false);
    }
  };

  const handleEdit = () => {
    if (!id) return;
    navigate(`/world-info/${id}/edit`);
  };

  const handleExport = () => {
    if (!worldInfo) return;
    const exportData = {
      name: worldInfo.name,
      description: worldInfo.short_description,
      entries: worldInfo.entries.map(e => ({ keywords: e.keywords, entry_text: e.entry_text }))
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${worldInfo.name.replace(/[^a-z0-9-_]/gi,'_') || 'world_info'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'World info downloaded.' });
  };

  const handleDelete = async () => {
    if (!worldInfo || !isOwner) return;
    try {
      const { error } = await supabase.from('world_infos').delete().eq('id', worldInfo.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'World info deleted.' });
      navigate('/world-info');
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete world info', variant: 'destructive' });
    }
  };

  const toggleVisibility = async () => {
    if (!worldInfo || !isOwner) return;
    const newVisibility = worldInfo.visibility === 'public' ? 'private' : 'public';
    try {
      const { error } = await supabase.from('world_infos').update({ visibility: newVisibility }).eq('id', worldInfo.id);
      if (error) throw error;
      setWorldInfo(prev => prev ? { ...prev, visibility: newVisibility } : prev);
      toast({ title: 'Visibility Updated', description: `World info is now ${newVisibility}.` });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update visibility', variant: 'destructive' });
    }
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
      <div className="min-h-screen bg-[#121212]">
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !worldInfo) {
    return (
      <div className="min-h-screen bg-[#121212]">
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4 text-white">World Info Not Found</h2>
            <p className="text-gray-400 mb-4">{error || 'The world info you are looking for does not exist or is not public.'}</p>
            <Button onClick={() => navigate('/')} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="p-4 sm:p-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/world-info')}
              className="text-gray-400 hover:text-white mb-4"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="space-y-6">
              {/* Header / Hero */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <Avatar className="h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0">
                      {worldInfo.avatar_url ? (
                        <AvatarImage src={worldInfo.avatar_url} alt={worldInfo.name} className="object-cover" />
                      ) : (
                        <AvatarFallback className="bg-gray-700 text-gray-300">
                          <BookOpen className="w-8 h-8" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-2xl sm:text-3xl font-bold text-white break-words">{worldInfo.name}</h1>
                      {worldInfo.short_description && (
                        <p className="text-gray-400 mt-2 text-sm sm:text-base leading-relaxed break-words">{worldInfo.short_description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-3 text-xs sm:text-sm text-gray-400">
                        <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(worldInfo.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{worldInfo.interaction_count} views</span>
                        <span className="flex items-center gap-1"><Heart className="h-4 w-4" />{worldInfo.likesCount} likes</span>
                      </div>
                      {worldInfo.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {worldInfo.tags.map(tag => (
                            <Badge key={tag.id} variant="secondary" className="bg-gray-700 text-gray-300 text-xs">{tag.name}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleLike} variant={worldInfo.isLiked ? 'default' : 'outline'} size="sm" className="border-gray-600">
                      <Heart className={`mr-2 h-4 w-4 ${worldInfo.isLiked ? 'fill-current' : ''}`} /> {worldInfo.likesCount}
                    </Button>
                    <Button onClick={handleExport} variant="outline" size="sm" className="border-gray-600">
                      <Download className="mr-2 h-4 w-4" /> Export
                    </Button>
                    {isOwner && (
                      <Button onClick={toggleVisibility} variant="outline" size="sm" className="border-gray-600">
                        {worldInfo.visibility === 'public' ? <Globe className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                        {worldInfo.visibility === 'public' ? 'Make Private' : 'Make Public'}
                      </Button>
                    )}
                    {isOwner ? (
                      <Button onClick={handleDelete} variant="destructive" size="sm">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    ) : (
                      <Button onClick={handleUseLorebook} variant={worldInfo.isUsed ? 'outline' : 'secondary'} size="sm" className="border-gray-600">
                        <Download className="mr-2 h-4 w-4" /> {worldInfo.isUsed ? 'Remove' : 'Add'}
                      </Button>
                    )}
                    {canEdit && (
                      <Button onClick={handleEdit} variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-800">
                        <Edit2 className="w-4 h-4 mr-2" /> Edit
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Entries Section */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2"><BookOpen className="w-5 h-5" /> Entries ({worldInfo.entries.length})</h2>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search entries..."
                      value={entriesSearchQuery}
                      onChange={(e) => setEntriesSearchQuery(e.target.value)}
                      className="pl-9 bg-gray-800/50 border-gray-600 text-white"
                    />
                  </div>
                </div>
                {filteredEntries.length === 0 ? (
                  <p className="text-gray-400 text-center py-8 text-sm">{entriesSearchQuery ? 'No matching entries.' : 'No entries available.'}</p>
                ) : (
                  <div className="space-y-3">
                    {filteredEntries.map(entry => (
                      <div key={entry.id} className={`p-4 rounded-md border ${entry.keywords.length === 0 || !entry.entry_text.trim() ? 'border-red-500/50 bg-red-500/10' : 'border-gray-700 bg-gray-800/40'}`}>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {entry.keywords.length === 0 && <Badge variant="destructive" className="text-[10px]">No Keywords</Badge>}
                          {!entry.entry_text.trim() && <Badge variant="destructive" className="text-[10px]">Empty Text</Badge>}
                          {entry.keywords.map((k,i)=>(<Badge key={i} variant="outline" className="text-[10px] border-gray-500 text-gray-300">{k}</Badge>))}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-300 whitespace-pre-wrap leading-relaxed break-words">{entry.entry_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Similar Section */}
              {similarWorldInfos.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-white font-semibold">Similar World Infos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {similarWorldInfos.map(similarWorldInfo => (
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
                            <p className="text-sm text-gray-400 truncate">by {similarWorldInfo.creator?.username || 'Unknown'}</p>
                            {similarWorldInfo.short_description && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{similarWorldInfo.short_description}</p>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}