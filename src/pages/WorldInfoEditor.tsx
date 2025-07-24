import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Edit2, Trash2, Save, X, Search, Tag, User, BookOpen, Image, Loader2, ArrowLeft } from 'lucide-react';
import { TopBar } from '@/components/ui/TopBar';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Tables } from '@/integrations/supabase/types';
import {
  createWorldInfo,
  updateWorldInfo,
  addWorldInfoEntry,
  updateWorldInfoEntry,
  deleteWorldInfoEntry,
  addWorldInfoTag,
  removeWorldInfoTag,
  type WorldInfoCreationData,
  type WorldInfoEntryData
} from '@/lib/world-info-operations';
import { uploadAvatar } from '@/lib/avatar-upload';
import { 
  useWorldInfoWithEntries, 
  useAllTags, 
  useWorldInfoTags,
  type WorldInfoWithDetails
} from '@/hooks/useWorldInfos';

type WorldInfo = WorldInfoWithDetails & {
  entries?: Tables<'world_info_entries'>[];
  avatar_url?: string;
};

type WorldInfoEntry = Tables<'world_info_entries'>;

type Tag = {
  id: number;
  name: string;
};

interface TagSectionProps {
  selectedTags: Tag[];
  availableTags: Tag[];
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: number) => void;
}

const TagSection: React.FC<TagSectionProps> = ({ selectedTags, availableTags, onAddTag, onRemoveTag }) => {
  const availableForDropdown = availableTags.filter(tag => !selectedTags.some(selected => selected.id === tag.id));
  
  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Tag className="w-4 h-4" />
        Tags
      </Label>
      
      {/* Selected Tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="default"
              className="bg-primary text-primary-foreground cursor-pointer hover:bg-primary/80"
              onClick={() => onRemoveTag(tag.id)}
            >
              {tag.name}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}
      
      {/* Add Tag Dropdown */}
      {availableForDropdown.length > 0 && (
        <Select onValueChange={onAddTag}>
          <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
            <SelectValue placeholder="Add a tag..." />
          </SelectTrigger>
          <SelectContent>
            {availableForDropdown.map((tag) => (
              <SelectItem key={tag.id} value={tag.id.toString()}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

export default function WorldInfoEditor() {
  const { id } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  // Form states
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'unlisted' | 'private'>('private');
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  
  // Entry states
  const [newEntryKeywords, setNewEntryKeywords] = useState('');
  const [newEntryText, setNewEntryText] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryKeywords, setEditingEntryKeywords] = useState('');
  const [editingEntryText, setEditingEntryText] = useState('');
  const [entriesSearchQuery, setEntriesSearchQuery] = useState('');
  
  const [saving, setSaving] = useState(false);
  
  // Data fetching
  const { data: allTags = [] } = useAllTags();
  const { data: worldInfoDetails, refetch: refetchWorldInfoDetails } = useWorldInfoWithEntries(id || null);
  const { data: worldInfoTags = [] } = useWorldInfoTags(id || null);
  
  // Initialize form when editing existing world info
  useEffect(() => {
    if (id && worldInfoDetails) {
      setEditName(worldInfoDetails.name);
      setEditDescription(worldInfoDetails.short_description || '');
      setEditVisibility(worldInfoDetails.visibility as 'public' | 'unlisted' | 'private');
    }
  }, [id, worldInfoDetails]);
  
  // Initialize tags when editing existing world info
  useEffect(() => {
    if (id && worldInfoTags.length > 0) {
      setSelectedTags(worldInfoTags);
    }
  }, [id, worldInfoTags]);

  const handleBackToList = () => {
    navigate('/world-info');
  };

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setEditAvatarUrl(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddTag = async (tagId: string) => {
    const tagIdNum = parseInt(tagId);
    const tag = allTags.find(t => t.id === tagIdNum);
    if (!tag) return;

    if (id) {
      // If editing existing world info, add to database
      try {
        await addWorldInfoTag(id, tagIdNum);
        queryClient.invalidateQueries({ queryKey: ['world-info-tags', id] });
      } catch (error) {
        console.error('Error adding tag:', error);
        toast({
          title: "Error",
          description: "Failed to add tag",
          variant: "destructive"
        });
        return;
      }
    }

    // Add to local state
    setSelectedTags(prev => [...prev, tag]);
  };

  const handleRemoveTag = async (tagId: number) => {
    if (id) {
      // If editing existing world info, remove from database
      try {
        await removeWorldInfoTag(id, tagId);
        queryClient.invalidateQueries({ queryKey: ['world-info-tags', id] });
      } catch (error) {
        console.error('Error removing tag:', error);
        toast({
          title: "Error",
          description: "Failed to remove tag",
          variant: "destructive"
        });
        return;
      }
    }

    // Remove from local state
    setSelectedTags(prev => prev.filter(tag => tag.id !== tagId));
  };

  const handleCreateOrUpdateWorldInfo = async () => {
    if (!editName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for your world info",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);

      let avatarUrl = editAvatarUrl;
      if (editAvatarFile) {
        try {
          avatarUrl = await uploadAvatar(editAvatarFile, 'world-info-avatars');
        } catch (uploadError) {
          console.error('Avatar upload failed:', uploadError);
          toast({
            title: "Warning",
            description: "Failed to upload avatar, but world info will be created without it",
            variant: "default"
          });
          avatarUrl = '';
        }
      }

      const worldInfoData: WorldInfoCreationData = {
        name: editName.trim(),
        short_description: editDescription.trim(),
        visibility: editVisibility
      };

      let worldInfoId = id;

      if (id) {
        // Update existing world info
        await updateWorldInfo(id, worldInfoData);
        toast({
          title: "Success",
          description: "World info updated successfully"
        });
      } else {
        // Create new world info
        const newWorldInfo = await createWorldInfo(worldInfoData);
        worldInfoId = newWorldInfo.id;

        // Add tags to the new world info
        for (const tag of selectedTags) {
          try {
            await addWorldInfoTag(worldInfoId, tag.id);
          } catch (tagError) {
            console.error('Error adding tag to new world info:', tagError);
          }
        }

        toast({
          title: "Success",
          description: "World info created successfully"
        });
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      if (worldInfoId) {
        await queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', worldInfoId] });
      }

      // Navigate to the world info view page
      if (worldInfoId) {
        navigate(`/world-info-view/${worldInfoId}`);
      } else {
        navigate('/world-info');
      }
    } catch (error) {
      console.error('Error creating/updating world info:', error);
      toast({
        title: "Error",
        description: id ? "Failed to update world info" : "Failed to create world info",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntryKeywords.trim() || !newEntryText.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both keywords and entry text",
        variant: "destructive"
      });
      return;
    }

    if (!id) {
      // For new world infos, we need to save the world info first
      toast({
        title: "Save First",
        description: "Please save the world info before adding entries",
        variant: "destructive"
      });
      return;
    }

    try {
      const keywords = newEntryKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      const entryData: WorldInfoEntryData = {
        keywords,
        entry_text: newEntryText.trim()
      };

      await addWorldInfoEntry(id, entryData);

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', id] });
      await refetchWorldInfoDetails();

      setNewEntryKeywords('');
      setNewEntryText('');

      toast({
        title: "Success",
        description: "Entry added successfully"
      });
    } catch (error) {
      console.error('Error adding entry:', error);
      toast({
        title: "Error",
        description: "Failed to add entry",
        variant: "destructive"
      });
    }
  };

  const startEditingEntry = (entry: WorldInfoEntry) => {
    setEditingEntryId(entry.id);
    setEditingEntryKeywords(entry.keywords.join(', '));
    setEditingEntryText(entry.entry_text);
  };

  const cancelEditingEntry = () => {
    setEditingEntryId(null);
    setEditingEntryKeywords('');
    setEditingEntryText('');
  };

  const handleUpdateEntry = async () => {
    if (!editingEntryId || !id) return;

    if (!editingEntryKeywords.trim() || !editingEntryText.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both keywords and entry text",
        variant: "destructive"
      });
      return;
    }

    try {
      const keywords = editingEntryKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      const entryData: WorldInfoEntryData = {
        keywords,
        entry_text: editingEntryText.trim()
      };

      await updateWorldInfoEntry(editingEntryId, entryData);

      queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', id] });
      await refetchWorldInfoDetails();

      setEditingEntryId(null);
      setEditingEntryKeywords('');
      setEditingEntryText('');

      toast({
        title: "Success",
        description: "Entry updated successfully"
      });
    } catch (error) {
      console.error('Error updating entry:', error);
      toast({
        title: "Error",
        description: "Failed to update entry",
        variant: "destructive"
      });
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!id) return;

    try {
      await deleteWorldInfoEntry(entryId);

      queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', id] });
      await refetchWorldInfoDetails();

      toast({
        title: "Success",
        description: "Entry deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast({
        title: "Error",
        description: "Failed to delete entry",
        variant: "destructive"
      });
    }
  };

  const filteredEntries = worldInfoDetails?.entries?.filter(entry => {
    if (!entriesSearchQuery) return true;
    const searchLower = entriesSearchQuery.toLowerCase();
    return (
      entry.keywords.some(keyword => keyword.toLowerCase().includes(searchLower)) ||
      entry.entry_text.toLowerCase().includes(searchLower)
    );
  }) || [];

  return (
    <div className="min-h-screen bg-[#121212]">
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Standardized TopBar */}
          <TopBar
            title={id ? 'Edit World Info' : 'Create New World Info'}
            rightContent={
              <Button
                onClick={handleCreateOrUpdateWorldInfo}
                disabled={saving}
                className="bg-primary hover:bg-primary/80 text-white font-medium px-6 py-2 rounded-lg"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                {id ? 'Update' : 'Create'}
              </Button>
            }
          />

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Back button under TopBar */}
              <Button
                variant="ghost"
                onClick={handleBackToList}
                className="text-gray-400 hover:text-white mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to World Info
              </Button>
              {/* World Info Details Card */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <BookOpen className="w-5 h-5" />
                    World Info Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <Avatar className="h-24 w-24">
                        {editAvatarUrl ? (
                          <AvatarImage src={editAvatarUrl} alt="World Info Avatar" />
                        ) : (
                          <AvatarFallback className="bg-gray-700 text-gray-300">
                            <BookOpen className="w-8 h-8" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <Button
                        size="sm"
                        variant="outline"
                        className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0 border-gray-600"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Image className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-white">Avatar</Label>
                      <p className="text-sm text-gray-400 mt-1">Upload an image to represent your world info</p>
                    </div>
                  </div>

                  {/* Name and Description */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name" className="text-sm font-medium text-white">Name *</Label>
                      <Input
                        id="edit-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-gray-800/50 border-gray-600 text-white"
                        placeholder="Enter world info name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-visibility" className="text-sm font-medium text-white">Visibility</Label>
                      <Select value={editVisibility} onValueChange={(value: 'public' | 'unlisted' | 'private') => setEditVisibility(value)}>
                        <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="private">Private</SelectItem>
                          <SelectItem value="unlisted">Unlisted</SelectItem>
                          <SelectItem value="public">Public</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-description" className="text-sm font-medium text-white">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      className="bg-gray-800/50 border-gray-600 text-white"
                      placeholder="Enter a description for your world info"
                    />
                  </div>

                  {/* Tags Section */}
                  <TagSection
                    selectedTags={selectedTags}
                    availableTags={allTags}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                  />
                </CardContent>
              </Card>

              {/* Entries Section */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <BookOpen className="w-5 h-5" />
                    Lorebook Entries ({filteredEntries.length})
                  </CardTitle>
                  {id && (
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search entries..."
                        value={entriesSearchQuery}
                        onChange={(e) => setEntriesSearchQuery(e.target.value)}
                        className="pl-10 bg-gray-800/50 border-gray-600 text-white"
                      />
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Add New Entry Form */}
                  <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg border border-gray-600">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add New Entry
                    </h3>
                    {!id && (
                      <p className="text-sm text-gray-400">
                        Save the world info first to add entries.
                      </p>
                    )}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="new-entry-keywords" className="text-white">Keywords (comma-separated)</Label>
                        <Input
                          id="new-entry-keywords"
                          value={newEntryKeywords}
                          onChange={(e) => setNewEntryKeywords(e.target.value)}
                          placeholder="keyword1, keyword2, keyword3"
                          className="bg-gray-800/50 border-gray-600 text-white"
                          disabled={!id}
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-entry-text" className="text-white">Entry Text</Label>
                        <Textarea
                          id="new-entry-text"
                          value={newEntryText}
                          onChange={(e) => setNewEntryText(e.target.value)}
                          rows={4}
                          placeholder="Enter the content for this entry..."
                          className="bg-gray-800/50 border-gray-600 text-white"
                          disabled={!id}
                        />
                      </div>
                      <Button 
                        onClick={handleAddEntry} 
                        className="bg-primary hover:bg-primary/80"
                        disabled={!id}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Entry
                      </Button>
                    </div>
                  </div>

                  {/* Existing Entries */}
                  {id && (

                    <div className="space-y-4">
                      {filteredEntries.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No entries found</p>
                          {entriesSearchQuery && <p className="text-sm">Try adjusting your search</p>}
                        </div>
                      ) : (
                        filteredEntries.map((entry) => (
                          <Card key={entry.id} className="bg-gray-900/50 border-gray-600">
                            <CardContent className="p-4">
                              {editingEntryId === entry.id ? (
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="edit-entry-keywords" className="text-white">Keywords</Label>
                                    <Input
                                      id="edit-entry-keywords"
                                      value={editingEntryKeywords}
                                      onChange={(e) => setEditingEntryKeywords(e.target.value)}
                                      className="bg-gray-800/50 border-gray-600 text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="edit-entry-text" className="text-white">Entry Text</Label>
                                    <Textarea
                                      id="edit-entry-text"
                                      value={editingEntryText}
                                      onChange={(e) => setEditingEntryText(e.target.value)}
                                      rows={4}
                                      className="bg-gray-800/50 border-gray-600 text-white"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button onClick={handleUpdateEntry} size="sm">
                                      <Save className="w-4 h-4 mr-1" />
                                      Save
                                    </Button>
                                    <Button onClick={cancelEditingEntry} variant="outline" size="sm">
                                      <X className="w-4 h-4 mr-1" />
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                      {entry.keywords.map((keyword, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs font-medium">
                                          {keyword}
                                        </Badge>
                                      ))}
                                    </div>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-300">{entry.entry_text}</p>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => startEditingEntry(entry)}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button size="sm" variant="ghost">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Entry</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete this world info entry? This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleDeleteEntry(entry.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarSelect}
          className="hidden"
        />
      </main>
    </div>
  );
}
