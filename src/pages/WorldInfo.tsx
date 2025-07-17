import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Upload, Trash2, BookOpen, Heart, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  createWorldInfo,
  deleteWorldInfo,
  addWorldInfoEntry,
  type WorldInfoCreationData,
} from '@/lib/world-info-operations';
import { 
  useUserWorldInfos, 
  useUserWorldInfoCollection,
  type WorldInfoWithDetails
} from '@/hooks/useWorldInfos';

type WorldInfo = WorldInfoWithDetails;

export default function WorldInfo() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  
  const { data: worldInfos = [], isLoading: loading, refetch: refetchWorldInfos } = useUserWorldInfos();
  const { data: collectedWorldInfos = [] } = useUserWorldInfoCollection();

  const handleStartCreate = () => {
    navigate('/world-info-editor');
  };

  const handleViewWorldInfo = (worldInfo: WorldInfo) => {
    navigate(`/world-info-view/${worldInfo.id}`);
  };

  const handleDeleteWorldInfo = async (worldInfoId: string) => {
    try {
      await deleteWorldInfo(worldInfoId);
      
      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      
      toast({
        title: "Success",
        description: "World info deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting world info:', error);
      toast({
        title: "Error",
        description: "Failed to delete world info",
        variant: "destructive"
      });
    }
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: "Error",
        description: "Please select a JSON file.",
        variant: "destructive"
      });
      return;
    }

    try {
      setImporting(true);
      const text = await file.text();
      const jsonData = JSON.parse(text);
      
      // Validate JSON structure
      if (!jsonData.name || !jsonData.entries) {
        toast({
          title: "Error",
          description: "Invalid JSON format. Expected 'name' and 'entries' fields.",
          variant: "destructive"
        });
        return;
      }

      // Create the main World Info record
      const newWorldInfo = await createWorldInfo({
        name: jsonData.name,
        short_description: jsonData.description || '',
        visibility: 'private'
      });

      // Import entries
      const entries = Object.entries(jsonData.entries);
      for (const [key, value] of entries) {
        if (typeof value === 'object' && value !== null) {
          const entry = value as any;
          if (entry.keys && entry.content) {
            await addWorldInfoEntry(newWorldInfo.id, {
              keywords: Array.isArray(entry.keys) ? entry.keys : [entry.keys],
              entry_text: entry.content
            });
          }
        }
      }

      // Refresh the list
      await refetchWorldInfos();

      toast({
        title: "Success",
        description: `Successfully imported "${jsonData.name}" with ${entries.length} entries`
      });
    } catch (error) {
      console.error('Error importing file:', error);
      toast({
        title: "Error",
        description: "Failed to import file. Please check the format and try again.",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-700/50">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-white">World Infos</h1>
              <div className="flex space-x-2">
                <Button
                  onClick={handleStartCreate}
                  className="bg-primary hover:bg-primary/80 text-white font-medium px-4 py-2 rounded-lg"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New
                </Button>
                <Button
                  onClick={handleImportFile}
                  variant="outline"
                  className="border-primary/50 text-primary hover:bg-primary/10 font-medium px-4 py-2 rounded-lg"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
              </div>
            </div>
          </div>

          {/* World Info List */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-gray-400">Loading world infos...</span>
              </div>
            ) : worldInfos.length === 0 && collectedWorldInfos.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-300 mb-2">No World Infos Yet</h3>
                <p className="text-gray-500 mb-6">Create your first world info to get started</p>
                <Button
                  onClick={handleStartCreate}
                  className="bg-primary hover:bg-primary/80 text-white font-medium"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First World Info
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Created by User Column */}
                <div>
                  <h2 className="text-white text-xl font-semibold mb-6 flex items-center">
                    <BookOpen className="w-5 h-5 mr-2" />
                    My World Infos ({worldInfos.length})
                  </h2>
                  <div className="space-y-4">
                    {worldInfos.map((worldInfo) => (
                      <Card
                        key={worldInfo.id}
                        className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg relative h-[200px]"
                      >
                        <CardContent className="p-6 h-full flex flex-col">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1 min-h-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-white font-semibold text-xl line-clamp-1">
                                  {worldInfo.name}
                                </h3>
                                <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                                  worldInfo.visibility === 'public' 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : worldInfo.visibility === 'unlisted'
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                }`}>
                                  {worldInfo.visibility}
                                </span>
                              </div>
                              <p className="text-gray-400 text-base line-clamp-2 mb-3" style={{ height: '3rem' }}>
                                {worldInfo.short_description || "No description available"}
                              </p>
                              
                              {/* Stats */}
                              <div className="flex items-center gap-4 text-base text-gray-500 mb-3">
                                <span className="flex items-center gap-1">
                                  <FileText className="w-4 h-4" />
                                  {worldInfo.entriesCount || 0} entries
                                </span>
                                <span className="flex items-center gap-1">
                                  <Heart className="w-4 h-4" />
                                  {worldInfo.likesCount || 0} likes
                                </span>
                                <span>{worldInfo.interaction_count} uses</span>
                              </div>

                              {/* Tags - Fixed height container */}
                              <div className="mb-3" style={{ height: '2rem' }}>
                                {worldInfo.tags && worldInfo.tags.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {worldInfo.tags.slice(0, 3).map((tag) => (
                                      <Badge key={tag.id} variant="secondary" className="text-sm">
                                        {tag.name}
                                      </Badge>
                                    ))}
                                    {worldInfo.tags.length > 3 && (
                                      <Badge variant="secondary" className="text-sm">
                                        +{worldInfo.tags.length - 3} more
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <div></div>
                                )}
                              </div>
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete World Info</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{worldInfo.name}"? This action cannot be undone and will delete all associated entries.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteWorldInfo(worldInfo.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          
                          {/* Action Button - Bottom Right */}
                          <div className="absolute bottom-4 right-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewWorldInfo(worldInfo)}
                              className="border-primary/50 text-primary hover:bg-primary/10"
                            >
                              View
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    
                    {worldInfos.length === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No world infos created yet</p>
                        <p className="text-sm">Click "Create New" to get started</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Collection Column */}
                <div>
                  <h2 className="text-white text-xl font-semibold mb-6 flex items-center">
                    <Heart className="w-5 h-5 mr-2" />
                    My Collection ({collectedWorldInfos.length})
                  </h2>
                  <div className="space-y-4">
                    {collectedWorldInfos.map((worldInfo) => (
                      <Card
                        key={worldInfo.id}
                        className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg relative h-[200px]"
                      >
                        <CardContent className="p-6 h-full flex flex-col">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1 min-h-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-white font-semibold text-xl line-clamp-1">
                                  {worldInfo.name}
                                </h3>
                                <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                                  worldInfo.visibility === 'public' 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : worldInfo.visibility === 'unlisted'
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                }`}>
                                  {worldInfo.visibility}
                                </span>
                              </div>
                              <p className="text-gray-400 text-base line-clamp-2 mb-3" style={{ height: '3rem' }}>
                                {worldInfo.short_description || "No description available"}
                              </p>
                              
                              {/* Stats */}
                              <div className="flex items-center gap-4 text-base text-gray-500 mb-3">
                                <span className="flex items-center gap-1">
                                  <FileText className="w-4 h-4" />
                                  {worldInfo.entriesCount || 0} entries
                                </span>
                                <span className="flex items-center gap-1">
                                  <Heart className="w-4 h-4" />
                                  {worldInfo.likesCount || 0} likes
                                </span>
                                <span>{worldInfo.interaction_count} uses</span>
                              </div>

                              {/* Tags - Fixed height container */}
                              <div className="mb-3" style={{ height: '2rem' }}>
                                {worldInfo.tags && worldInfo.tags.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {worldInfo.tags.slice(0, 3).map((tag) => (
                                      <Badge key={tag.id} variant="secondary" className="text-sm">
                                        {tag.name}
                                      </Badge>
                                    ))}
                                    {worldInfo.tags.length > 3 && (
                                      <Badge variant="secondary" className="text-sm">
                                        +{worldInfo.tags.length - 3} more
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <div></div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Action Button - Bottom Right */}
                          <div className="absolute bottom-4 right-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewWorldInfo(worldInfo)}
                              className="border-primary/50 text-primary hover:bg-primary/10"
                            >
                              View
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    
                    {collectedWorldInfos.length === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No world infos in collection yet</p>
                        <p className="text-sm">Explore and save world infos to build your collection</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Import Loading Dialog */}
        <Dialog open={importing} onOpenChange={setImporting}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importing World Info</DialogTitle>
              <DialogDescription>
                Please wait while we process your world info file. This may take a few moments for larger files.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </DialogContent>
        </Dialog>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </main>
    </div>
  );
}