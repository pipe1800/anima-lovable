import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Upload, Edit2, Trash2, Save, X, Search, Tag, User, BookOpen, Image, Loader2, ArrowLeft, Heart, FileText } from 'lucide-react';
import { TopBar } from '@/components/ui/TopBar';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Tables } from '@/integrations/supabase/types';
import {
  createWorldInfo as createWorldInfoRaw,
  updateWorldInfoCore,
  cascadeDeleteWorldInfo,
  addWorldInfoEntry as addWorldInfoEntryRaw,
  updateWorldInfoEntry as updateWorldInfoEntryRaw,
  deleteWorldInfoEntry as deleteWorldInfoEntryRaw,
  addWorldInfoTag as addWorldInfoTagRaw,
  removeWorldInfoTag as removeWorldInfoTagRaw
} from '@/data/worldInfo/mutations';
import {
  toggleWorldInfoLike as toggleWorldInfoLikeRaw,
  addWorldInfoToCollection as addWorldInfoToCollectionRaw,
  removeWorldInfoFromCollection as removeWorldInfoFromCollectionRaw
} from '@/data/worldInfo/interactions';
import { uploadAvatar } from '@/data/uploads/storage';
import { 
  useUserWorldInfos, 
  useUserWorldInfoCollection, 
  useWorldInfoWithEntries, 
  useAllTags, 
  useWorldInfoTags,
  type WorldInfoWithDetails
} from '@/hooks/useWorldInfos';

type WorldInfo = WorldInfoWithDetails & {
  avatar_url?: string;
  entries?: WorldInfoEntry[]; // added optional for local handling
};

// type WorldInfoEntry = Tables<'world_info_entries'>;

// Temporary loose typing
type WorldInfoEntry = {
  id: string;
  keywords: string[];
  entry_text: string;
};

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

const WorldInfoCreator = () => {
  // Limits
  const MAX_ENTRY_CHARS = 2000;
  const MAX_KEYWORDS = 10;

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  // React Query hooks for optimized data fetching
  const { data: worldInfos = [], isLoading: worldInfosLoading, refetch: refetchWorldInfos } = useUserWorldInfos();
  const { data: collectedWorldInfos = [], isLoading: collectionLoading, refetch: refetchCollection } = useUserWorldInfoCollection();
  const { data: availableTags = [] } = useAllTags();
  
  const [selectedWorldInfo, setSelectedWorldInfo] = useState<WorldInfo | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  // Form states
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'unlisted' | 'private'>('private');
  
  // Entry form states
  const [newEntryKeywords, setNewEntryKeywords] = useState('');
  const [newEntryText, setNewEntryText] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryKeywords, setEditingEntryKeywords] = useState('');
  const [editingEntryText, setEditingEntryText] = useState('');
  const [entriesSearchQuery, setEntriesSearchQuery] = useState('');
  
  // Tag states
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  
  // View states
  const [showWorldInfoList, setShowWorldInfoList] = useState(true);
  const [editingWorldInfo, setEditingWorldInfo] = useState<WorldInfo | null>(null);
  
  // Unsaved changes detection
  const [isDirty, setIsDirty] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  
  // Computed loading state
  const loading = worldInfosLoading || collectionLoading;

  // Get tags for selected world info
  const { data: worldInfoTags = [] } = useWorldInfoTags(selectedWorldInfo?.id || null);
  
  // Get detailed world info with entries
  const { data: worldInfoDetails, refetch: refetchWorldInfoDetails } = useWorldInfoWithEntries(selectedWorldInfo?.id || null);
  
  // Update selected tags when world info tags change
  React.useEffect(() => {
    setSelectedTags(worldInfoTags);
  }, [worldInfoTags]);

  // Unsaved changes detection
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  React.useEffect(() => {
    const dirty = !!(editName || editDescription || editAvatarFile || selectedTags.length || newEntryKeywords || newEntryText);
    setIsDirty(dirty);
  }, [editName, editDescription, editAvatarFile, selectedTags, newEntryKeywords, newEntryText]);

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditAvatarFile(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setEditAvatarUrl(previewUrl);
    }
  };

  const handleCreateNew = async () => {
    if (!editName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the World Info",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      
      let avatarUrl = '';
      if (editAvatarFile && user) {
        setUploadingAvatar(true);
        const { publicUrl } = await uploadAvatar(user.id, editAvatarFile as any);
        if (publicUrl) {
          avatarUrl = publicUrl;
        }
        setUploadingAvatar(false);
      }

      const newWorldInfoResult = await createWorldInfoRaw({
        name: editName,
        short_description: editDescription,
        visibility: editVisibility
      });
      if (newWorldInfoResult.error || !newWorldInfoResult.data) throw newWorldInfoResult.error || new Error('Create failed');
      const newWorldInfo = newWorldInfoResult.data;
      // Add avatar_url to local state for display
      const newWorldInfoWithAvatar = { ...newWorldInfo, avatar_url: avatarUrl };
      // Add selected tags
      for (const tag of selectedTags) {
        await addWorldInfoTagRaw(newWorldInfo.id, tag.id);
      }
      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      // Set selected world info for editing - create proper type
      const newWorldInfoComplete: WorldInfo = {
        ...newWorldInfo,
        avatar_url: avatarUrl,
        entries: [],
        entriesCount: 0,
        likesCount: newWorldInfo.likes_count || 0,
        tags: selectedTags
      } as any;
      setSelectedWorldInfo(newWorldInfoComplete);
      setIsCreating(false);
      
      // Reset form
      setEditName('');
      setEditDescription('');
      setEditAvatarFile(null);
      setEditAvatarUrl('');
      setEditVisibility('private');
      setSelectedTags([]);
      setNewEntryKeywords('');
      setNewEntryText('');
      setShowWorldInfoList(false);
      
      toast({
        title: "Success",
        description: "World Info created successfully"
      });
      // Navigate back to main world info page after create
      navigate('/world-info');
    } catch (error) {
      console.error('Error creating world info:', error);
      toast({
        title: "Error",
        description: "Failed to create World Info",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
      setUploadingAvatar(false);
    }
  };

  const handleSelectWorldInfo = (worldInfo: WorldInfo) => {
    setSelectedWorldInfo(worldInfo);
    setIsEditing(false);
    setEditingEntryId(null);
    setShowWorldInfoList(false);
  };

  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const guardedNav = (to: string) => {
    if (isDirty) {
      setPendingNav(to);
      setShowExitDialog(true);
    } else {
      navigateRef.current(to);
    }
  };

  const handleViewWorldInfo = (worldInfo: WorldInfo) => {
    guardedNav(`/world-info-view/${worldInfo.id}`);
  };

  const handleUpdateWorldInfo = async () => {
    if (!selectedWorldInfo || !editName.trim()) return;

    try {
      setSaving(true);
      
      let avatarUrl = selectedWorldInfo.avatar_url || '';
      if (editAvatarFile && user) {
        setUploadingAvatar(true);
        const { publicUrl } = await uploadAvatar(user.id, editAvatarFile as any);
        if (publicUrl) {
          avatarUrl = publicUrl;
        }
        setUploadingAvatar(false);
      }

      await updateWorldInfoCore(selectedWorldInfo.id, {
        name: editName,
        short_description: editDescription,
        visibility: editVisibility
      });
      
      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      await queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', selectedWorldInfo.id] });
      
      // Update selected world info
      const updatedInfoWithAvatar = { ...selectedWorldInfo, name: editName, short_description: editDescription, visibility: editVisibility, avatar_url: avatarUrl };
      setSelectedWorldInfo(updatedInfoWithAvatar);
      setIsEditing(false);
      
      toast({
        title: "Success",
        description: "World Info updated successfully"
      });
      // Navigate back after save
      navigate('/world-info');
    } catch (error) {
      console.error('Error updating world info:', error);
      toast({
        title: "Error",
        description: "Failed to update World Info",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
      setUploadingAvatar(false);
    }
  };

  const handleDeleteWorldInfo = async (worldInfoId: string, worldInfoName?: string) => {
    try {
      await cascadeDeleteWorldInfo(worldInfoId);
      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      if (selectedWorldInfo?.id === worldInfoId) {
        setSelectedWorldInfo(null);
        setShowWorldInfoList(true);
      }
      
      toast({
        title: "Success",
        description: `"${worldInfoName || 'World Info'}" deleted successfully`
      });
    } catch (error) {
      console.error('Error deleting world info:', error);
      toast({
        title: "Error",
        description: "Failed to delete World Info",
        variant: "destructive"
      });
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!selectedWorldInfo) return;
    
    const tagToAdd = availableTags.find(tag => tag.id.toString() === tagId);
    if (!tagToAdd || selectedTags.some(tag => tag.id === tagToAdd.id)) return;

    try {
      await addWorldInfoTagRaw(selectedWorldInfo.id, tagToAdd.id);
      setSelectedTags(prev => [...prev, tagToAdd]);
      // Invalidate tags query to refresh
      queryClient.invalidateQueries({ queryKey: ['world-info-tags', selectedWorldInfo.id] });
    } catch (error) {
      console.error('Error adding tag:', error);
      toast({
        title: "Error",
        description: "Failed to add tag",
        variant: "destructive"
      });
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!selectedWorldInfo) return;

    try {
      await removeWorldInfoTagRaw(selectedWorldInfo.id, tagId);
      setSelectedTags(prev => prev.filter(tag => tag.id !== tagId));
      // Invalidate tags query to refresh
      queryClient.invalidateQueries({ queryKey: ['world-info-tags', selectedWorldInfo.id] });
    } catch (error) {
      console.error('Error removing tag:', error);
      toast({
        title: "Error",
        description: "Failed to remove tag",
        variant: "destructive"
      });
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

    // If we're creating a new world info, we need to create it first
    if (isCreating) {
      toast({
        title: "Create World Info First",
        description: "Please create the world info first, then you can add entries",
        variant: "destructive"
      });
      return;
    }

    if (!selectedWorldInfo) return;

    try {
      const keywords = newEntryKeywords.split(',').map(k => k.trim()).filter(k => k);
      await addWorldInfoEntryRaw(selectedWorldInfo.id, {
        keywords,
        entry_text: newEntryText
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', selectedWorldInfo.id] });
      await refetchWorldInfoDetails();
      
      // Reset form
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

  const handleUpdateEntry = async () => {
    if (!editingEntryId || !editingEntryKeywords.trim() || !editingEntryText.trim()) return;

    try {
      const keywords = editingEntryKeywords.split(',').map(k => k.trim()).filter(k => k);
      await updateWorldInfoEntryRaw(editingEntryId, {
        keywords,
        entry_text: editingEntryText
      });
      
      // Invalidate queries to refresh data
      if (selectedWorldInfo) {
        queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', selectedWorldInfo.id] });
        await refetchWorldInfoDetails();
      }
      
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
    try {
      await deleteWorldInfoEntryRaw(entryId);
      
      // Invalidate queries to refresh data
      if (selectedWorldInfo) {
        queryClient.invalidateQueries({ queryKey: ['world-info-with-entries', selectedWorldInfo.id] });
        await refetchWorldInfoDetails();
      }
      
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

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json') {
      toast({
        title: "Error",
        description: "Please select a JSON file",
        variant: "destructive"
      });
      return;
    }

    try {
      setImporting(true);
      const text = await file.text();
      const jsonData = JSON.parse(text);
      
      const rawEntries = jsonData.entries || jsonData.data?.entries || [];
      let entriesArray: any[] = [];
      if (Array.isArray(rawEntries)) {
        entriesArray = rawEntries;
      } else if (rawEntries && typeof rawEntries === 'object') {
        entriesArray = Object.entries(rawEntries).map(([k, v]: [string, any]) => ({
          keywords: v?.keys || v?.key || v?.keywords || [],
          entry_text: v?.entry_text || v?.content || v?.entry || v?.text || ''
        }));
      }
      if (entriesArray.length > 100) entriesArray = entriesArray.slice(0,100);

      navigate('/world-info/create', {
        state: {
          importedWorldInfo: {
            name: jsonData.name || jsonData.data?.name || '',
            description: jsonData.description || jsonData.data?.description || '',
            entries: entriesArray
          }
        }
      });

      toast({
        title: "Imported",
        description: `Staged ${entriesArray.length} entries for editing`
      });
    } catch (error) {
      console.error('Error staging import:', error);
      toast({
        title: "Error",
        description: "Failed to read JSON.",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value='';
    }
  };

  const startEditing = (worldInfo: WorldInfo) => {
    setEditName(worldInfo.name);
    setEditDescription(worldInfo.short_description || '');
    setEditAvatarUrl(worldInfo.avatar_url || '');
    setEditAvatarFile(null);
    setEditVisibility(worldInfo.visibility as 'public' | 'unlisted' | 'private');
    setIsEditing(true);
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

  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedWorldInfo(null);
    setEditName('');
    setEditDescription('');
    setEditAvatarFile(null);
    setEditAvatarUrl('');
    setEditVisibility('private');
    setSelectedTags([]);
    setNewEntryKeywords('');
    setNewEntryText('');
    setShowWorldInfoList(false);
  };

  const handleBackToList = () => {
    guardedNav('/world-info');
    setSelectedWorldInfo(null);
    setIsCreating(false);
    setIsEditing(false);
  };

  const filteredEntries = selectedWorldInfo?.entries?.filter(entry => {
    if (!entriesSearchQuery) return true;
    const searchLower = entriesSearchQuery.toLowerCase();
    return (
      entry.keywords.some(keyword => keyword.toLowerCase().includes(searchLower)) ||
      entry.entry_text.toLowerCase().includes(searchLower)
    );
  }) || [];

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
          {showWorldInfoList ? (
            <div className="h-full flex flex-col">
              {/* Standardized TopBar */}
              <TopBar
                title="World Infos"
                leftContent={
                  <Button
                    onClick={() => navigate('/dashboard')}
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-white"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                }
                rightContent={
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
                }
              />

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
                    
                    {/* User's Collection Column */}
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
                                       <span>by @{worldInfo.creator?.username || 'Unknown'}</span>
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
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     // Remove from collection logic would go here
                                   }}
                                   className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                 >
                                   <Trash2 className="w-4 h-4" />
                                 </Button>
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
                            <p>No world infos in collection</p>
                            <p className="text-sm">Discover and add world infos from the community</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col bg-[#121212]">
              {/* Standardized TopBar for Creation Mode */}
              <TopBar
                title={isCreating ? 'Create New World Info' : 'World Info Creator'}
                leftContent={
                  <Button
                    onClick={handleBackToList}
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-white"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                }
              />
              
              <div className="flex-1 overflow-auto">
                {isCreating ? (
                  <div className="p-6 space-y-6">
                    {/* Basic Information Card - Identical to Edit Mode */}
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                          <User className="w-5 h-5" />
                          World Info Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="flex flex-col items-center gap-4">
                          <div className="relative">
                            <Avatar className="w-24 h-24 border-2 border-dashed border-primary/30 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                              <AvatarImage src={editAvatarUrl} />
                              <AvatarFallback className="bg-primary/10">
                                <Image className="w-8 h-8 text-primary/50" />
                              </AvatarFallback>
                            </Avatar>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                              onClick={() => avatarInputRef.current?.click()}
                              disabled={uploadingAvatar}
                            >
                              {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                            </Button>
                          </div>
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarSelect}
                            className="hidden"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="edit-name" className="text-white">Name</Label>
                            <Input
                              id="edit-name"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="World info name"
                              className="bg-gray-800/50 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label htmlFor="edit-visibility" className="text-white">Visibility</Label>
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
                        <div>
                          <Label htmlFor="edit-description" className="text-white">Description</Label>
                          <Textarea
                            id="edit-description"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Brief description of this world"
                            rows={3}
                            className="bg-gray-800/50 border-gray-600 text-white"
                          />
                        </div>
                        <TagSection
                          selectedTags={selectedTags}
                          availableTags={availableTags}
                          onAddTag={(tagId: string) => {
                            const tagToAdd = availableTags.find(tag => tag.id.toString() === tagId);
                            if (tagToAdd && !selectedTags.some(tag => tag.id === tagToAdd.id)) {
                              setSelectedTags(prev => [...prev, tagToAdd]);
                            }
                          }}
                          onRemoveTag={(tagId: number) => {
                            setSelectedTags(prev => prev.filter(tag => tag.id !== tagId));
                          }}
                        />
                        <div className="flex gap-2">
                          <Button onClick={handleCreateNew} disabled={saving || uploadingAvatar}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            {saving ? 'Creating...' : 'Create World Info'}
                          </Button>
                          <Button variant="outline" onClick={handleBackToList}>
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* World Info Entries Card - Identical to Edit Mode */}
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-white">
                          <span className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            World Info Entries
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                              <Input
                                placeholder="Search entries..."
                                value={entriesSearchQuery}
                                onChange={(e) => setEntriesSearchQuery(e.target.value)}
                                className="pl-8 w-64 bg-gray-800/50 border-gray-600 text-white"
                              />
                            </div>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Add New Entry Form */}
                        <Card className="bg-gray-700/50 border-gray-600">
                          <CardContent className="p-4">
                            {/* Removed title heading as requested */}
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="new-entry-keywords" className="text-white flex items-center justify-between">
                                  <span>Keywords (comma-separated)</span>
                                  <span className={`text-xs ${newEntryKeywords.split(',').map(k=>k.trim()).filter(k=>k).length > MAX_KEYWORDS ? 'text-red-400' : 'text-gray-400'}`}>
                                    {newEntryKeywords.split(',').map(k=>k.trim()).filter(k=>k).length}/{MAX_KEYWORDS}
                                  </span>
                                </Label>
                                <Input
                                  id="new-entry-keywords"
                                  value={newEntryKeywords}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const parts = raw.split(',').map(p=>p.trim()).filter(p=>p);
                                    if (parts.length > MAX_KEYWORDS) {
                                      toast({ title: 'Keyword limit', description: `Maximum ${MAX_KEYWORDS} keywords per entry. Extra keywords ignored.`, variant: 'destructive' });
                                      const limited = parts.slice(0, MAX_KEYWORDS).join(', ');
                                      setNewEntryKeywords(limited);
                                    } else {
                                      setNewEntryKeywords(raw);
                                    }
                                  }}
                                  placeholder="character name, location, event"
                                  className="bg-gray-800/50 border-gray-600 text-white"
                                />
                              </div>
                              <div>
                                <Label htmlFor="new-entry-text" className="text-white flex items-center justify-between">
                                  <span>Entry Text</span>
                                  <span className={`text-xs ${newEntryText.length > MAX_ENTRY_CHARS ? 'text-red-400' : 'text-gray-400'}`}>{newEntryText.length}/{MAX_ENTRY_CHARS}</span>
                                </Label>
                                <Textarea
                                  id="new-entry-text"
                                  value={newEntryText}
                                  onChange={(e) => {
                                    const val = e.target.value.slice(0, MAX_ENTRY_CHARS);
                                    setNewEntryText(val);
                                  }}
                                  placeholder="Describe the lore or information"
                                  rows={4}
                                  className="bg-gray-800/50 border-gray-600 text-white"
                                />
                              </div>
                              <Button 
                                onClick={handleAddEntry} 
                                disabled={!
                                  newEntryKeywords.trim() || !newEntryText.trim() || newEntryText.length === 0
                                }
                                className="w-full"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Entry
                              </Button>
                            </div>
                          </CardContent>
                        </Card>

                        {/* World Info Entries - No entries message */}
                        <div className="space-y-4">
                          <div className="text-center py-12 text-gray-400">
                            <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <h3 className="text-lg font-medium mb-2 text-white">No entries yet</h3>
                            <p>Create your world info first, then add entries above to get started.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : selectedWorldInfo ? (
                  <div className="p-6 space-y-6">
                    {/* Basic Information Card */}
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                          <User className="w-5 h-5" />
                          World Info Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {isEditing ? (
                          <>
                            <div className="flex flex-col items-center gap-4">
                              <div className="relative">
                                <Avatar className="w-24 h-24 border-2 border-dashed border-primary/30 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                                  <AvatarImage src={editAvatarUrl} />
                                  <AvatarFallback className="bg-primary/10">
                                    <Image className="w-8 h-8 text-primary/50" />
                                  </AvatarFallback>
                                </Avatar>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                                  onClick={() => avatarInputRef.current?.click()}
                                  disabled={uploadingAvatar}
                                >
                                  {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="edit-name" className="text-white">Name</Label>
                                <Input
                                  id="edit-name"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  placeholder="World info name"
                                  className="bg-gray-800/50 border-gray-600 text-white"
                                />
                              </div>
                              <div>
                                <Label htmlFor="edit-visibility" className="text-white">Visibility</Label>
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
                            <div>
                              <Label htmlFor="edit-description" className="text-white">Description</Label>
                              <Textarea
                                id="edit-description"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="Brief description of this world"
                                rows={3}
                                className="bg-gray-800/50 border-gray-600 text-white"
                              />
                            </div>
                            <TagSection
                              selectedTags={selectedTags}
                              availableTags={availableTags}
                              onAddTag={(tagId: string) => {
                                const tagToAdd = availableTags.find(tag => tag.id.toString() === tagId);
                                if (tagToAdd && !selectedTags.some(tag => tag.id === tagToAdd.id)) {
                                  setSelectedTags(prev => [...prev, tagToAdd]);
                                }
                              }}
                              onRemoveTag={(tagId: number) => {
                                setSelectedTags(prev => prev.filter(tag => tag.id !== tagId));
                              }}
                            />
                            <div className="flex gap-2">
                              <Button onClick={handleUpdateWorldInfo} disabled={saving || uploadingAvatar}>
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                {saving ? 'Saving...' : 'Save Changes'}
                              </Button>
                              <Button variant="outline" onClick={() => setIsEditing(false)}>
                                Cancel
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start gap-6">
                              <Avatar className="w-20 h-20 flex-shrink-0">
                                <AvatarImage src={selectedWorldInfo.avatar_url} />
                                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10">
                                  <BookOpen className="w-10 h-10 text-primary" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <h2 className="text-3xl font-bold text-white">{selectedWorldInfo.name}</h2>
                                <p className="text-gray-400 mt-2 text-lg">
                                  {selectedWorldInfo.short_description || 'No description provided'}
                                </p>
                                <div className="flex items-center gap-3 mt-4">
                                  <Badge variant="outline" className="px-3 py-1">
                                    {selectedWorldInfo.visibility}
                                  </Badge>
                                  <Badge variant="secondary" className="px-3 py-1">
                                    {selectedWorldInfo.entries?.length || 0} entries
                                  </Badge>
                                </div>
                              </div>
                              <Button onClick={() => startEditing(selectedWorldInfo)} className="flex-shrink-0">
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit
                              </Button>
                            </div>
                            <Separator />
                            <TagSection
                              selectedTags={selectedTags}
                              availableTags={availableTags}
                              onAddTag={handleAddTag}
                              onRemoveTag={handleRemoveTag}
                            />
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* World Info Entries Card */}
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-white">
                          <span className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            World Info Entries
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                              <Input
                                placeholder="Search entries..."
                                value={entriesSearchQuery}
                                onChange={(e) => setEntriesSearchQuery(e.target.value)}
                                className="pl-8 w-64 bg-gray-800/50 border-gray-600 text-white"
                              />
                            </div>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Add New Entry Form */}
                        <Card className="bg-gray-700/50 border-gray-600">
                          <CardContent className="p-4">
                            {/* Removed title heading as requested */}
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="new-entry-keywords" className="text-white flex items-center justify-between">
                                  <span>Keywords (comma-separated)</span>
                                  <span className={`text-xs ${newEntryKeywords.split(',').map(k=>k.trim()).filter(k=>k).length > MAX_KEYWORDS ? 'text-red-400' : 'text-gray-400'}`}>
                                    {newEntryKeywords.split(',').map(k=>k.trim()).filter(k=>k).length}/{MAX_KEYWORDS}
                                  </span>
                                </Label>
                                <Input
                                  id="new-entry-keywords"
                                  value={newEntryKeywords}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const parts = raw.split(',').map(p=>p.trim()).filter(p=>p);
                                    if (parts.length > MAX_KEYWORDS) {
                                      toast({ title: 'Keyword limit', description: `Maximum ${MAX_KEYWORDS} keywords per entry. Extra keywords ignored.`, variant: 'destructive' });
                                      const limited = parts.slice(0, MAX_KEYWORDS).join(', ');
                                      setNewEntryKeywords(limited);
                                    } else {
                                      setNewEntryKeywords(raw);
                                    }
                                  }}
                                  placeholder="character name, location, event"
                                  className="bg-gray-800/50 border-gray-600 text-white"
                                />
                              </div>
                              <div>
                                <Label htmlFor="new-entry-text" className="text-white flex items-center justify-between">
                                  <span>Entry Text</span>
                                  <span className={`text-xs ${newEntryText.length > MAX_ENTRY_CHARS ? 'text-red-400' : 'text-gray-400'}`}>{newEntryText.length}/{MAX_ENTRY_CHARS}</span>
                                </Label>
                                <Textarea
                                  id="new-entry-text"
                                  value={newEntryText}
                                  onChange={(e) => {
                                    const val = e.target.value.slice(0, MAX_ENTRY_CHARS);
                                    setNewEntryText(val);
                                  }}
                                  placeholder="Describe the lore or information"
                                  rows={4}
                                  className="bg-gray-800/50 border-gray-600 text-white"
                                />
                              </div>
                              <Button 
                                onClick={handleAddEntry} 
                                disabled={!
                                  newEntryKeywords.trim() || !newEntryText.trim() || newEntryText.length === 0
                                }
                                className="w-full"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Entry
                              </Button>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Entries List */}
                        <div className="space-y-4">
                          {filteredEntries.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                              <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
                              <h3 className="text-lg font-medium mb-2 text-white">No entries found</h3>
                              <p>{entriesSearchQuery ? 'No entries match your search' : 'Add your first world info entry above to get started.'}</p>
                            </div>
                          ) : (
                            filteredEntries.map((entry) => (
                              <Card key={entry.id} className={`border-l-4 bg-gray-700/30 border-gray-600 ${entry.keywords.length === 0 || !entry.entry_text.trim() ? 'ring-1 ring-red-500/60 border-l-red-500/70' : 'border-l-primary/30'}`}>
                                <CardContent className="p-4">
                                  {editingEntryId === entry.id ? (
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="edit-entry-keywords" className="text-white flex items-center justify-between">
                                          <span>Keywords</span>
                                          <span className={`text-xs ${editingEntryKeywords.split(',').map(k=>k.trim()).filter(k=>k).length > MAX_KEYWORDS ? 'text-red-400' : 'text-gray-400'}`}>{editingEntryKeywords.split(',').map(k=>k.trim()).filter(k=>k).length}/{MAX_KEYWORDS}</span>
                                        </Label>
                                        <Input
                                          id="edit-entry-keywords"
                                          value={editingEntryKeywords}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const parts = raw.split(',').map(p=>p.trim()).filter(p=>p);
                                            if (parts.length > MAX_KEYWORDS) {
                                              toast({ title: 'Keyword limit', description: `Maximum ${MAX_KEYWORDS} keywords per entry. Extra keywords ignored.`, variant: 'destructive' });
                                              const limited = parts.slice(0, MAX_KEYWORDS).join(', ');
                                              setEditingEntryKeywords(limited);
                                            } else {
                                              setEditingEntryKeywords(raw);
                                            }
                                          }}
                                          className="bg-gray-800/50 border-gray-600 text-white"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-entry-text" className="text-white flex items-center justify-between">
                                          <span>Entry Text</span>
                                          <span className={`text-xs ${editingEntryText.length > MAX_ENTRY_CHARS ? 'text-red-400' : 'text-gray-400'}`}>{editingEntryText.length}/{MAX_ENTRY_CHARS}</span>
                                        </Label>
                                        <Textarea
                                          id="edit-entry-text"
                                          value={editingEntryText}
                                          onChange={(e) => {
                                            const val = e.target.value.slice(0, MAX_ENTRY_CHARS);
                                            setEditingEntryText(val);
                                          }}
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
                                          {entry.keywords.length === 0 && (
                                            <Badge variant="destructive" className="text-xs">Missing Keywords</Badge>
                                          )}
                                          {!entry.entry_text.trim() && (
                                            <Badge variant="destructive" className="text-xs">Missing Text</Badge>
                                          )}
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
                      </CardContent>
                    </Card>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </main>
        
        {/* Import Loading Dialog */}
        <Dialog open={importing} onOpenChange={setImporting}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importing World Info</DialogTitle>
              <p className="text-gray-400 text-sm">Please wait while we process your world info file. This may take a few moments for larger files.</p>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </DialogContent>
        </Dialog>

        {/* Unsaved Changes Exit Confirmation Dialog */}
        <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
          <DialogContent className="bg-[#1a1a2e] border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Discard changes?</DialogTitle>
            </DialogHeader>
            <p className="text-gray-300">You have unsaved changes. Continue editing or discard?</p>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" className="border-gray-600" onClick={() => setShowExitDialog(false)}>Continue Editing</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={() => { setShowExitDialog(false); if (pendingNav) navigateRef.current(pendingNav); }}>Discard</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarSelect}
          className="hidden"
        />
      </div>
    );
  };

export default WorldInfoCreator;