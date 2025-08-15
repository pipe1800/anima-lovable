import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Edit2, Trash2, Save, X, Search, Tag, BookOpen, Image, Loader2, ArrowLeft } from 'lucide-react';
import { TopBar } from '@/components/ui/TopBar';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type WorldInfo = WorldInfoWithDetails & {
  entries?: any[];
  avatar_url?: string;
};

// Replace incorrect Tables generic usage
// entries?: Tables<'world_info_entries'>[];
// type WorldInfoEntry = Tables<'world_info_entries'>;
// Use loose typing to resolve build error (can refine later)
type WorldInfoEntry = any;

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
  const location = useLocation();
  const importedState = (location.state as any)?.importedWorldInfo;
  const isStagedImport = !id && importedState;

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
  const [isDirty, setIsDirty] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<null | string>(null);

  // Keyword & text limit helpers (max 10 keywords, 5 words per keyword, 1000 chars text)
  const processKeywordsInput = (input: string) => {
    return input
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .slice(0, 10) // cap keyword count
      .map(k => {
        const words = k.split(/\s+/).filter(w => w.length > 0).slice(0, 5); // cap words per keyword
        return words.join(' ');
      })
      .join(', ');
  };
  const getKeywordsArray = (value: string) => value
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  const onNewKeywordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewEntryKeywords(processKeywordsInput(e.target.value));
  };
  const onEditingKeywordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingEntryKeywords(processKeywordsInput(e.target.value));
  };
  const onNewEntryTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewEntryText(e.target.value.slice(0, 1000));
  };
  const onEditingEntryTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingEntryText(e.target.value.slice(0, 1000));
  };

  // Local staged entries (for new imported before creation)
  const [stagedEntries, setStagedEntries] = useState<Array<{ tempId: string; keywords: string[]; entry_text: string }>>(
    isStagedImport
      ? importedState.entries.slice(0, 100).map((e: any, idx: number) => ({
          tempId: `imp-${idx}`,
          keywords: Array.isArray(e.keywords) ? e.keywords : (e.keywords ? [e.keywords] : []),
          entry_text: e.entry_text || ''
        }))
      : []
  );

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

  // Pre-fill name/description for staged import
  useEffect(() => {
    if (isStagedImport) {
      setEditName(importedState.name || '');
      setEditDescription(importedState.description || '');
    }
  }, [isStagedImport, importedState]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!id) {
      setIsDirty(!!(editName || editDescription || selectedTags.length || stagedEntries.length));
    } else if (worldInfoDetails) {
      const changed = (
        editName !== worldInfoDetails.name ||
        (editDescription || '') !== (worldInfoDetails.short_description || '') ||
        selectedTags.length !== worldInfoTags.length
      );
      setIsDirty(changed);
    }
  }, [editName, editDescription, selectedTags, stagedEntries, id, worldInfoDetails, worldInfoTags]);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const guardedNavigateDirect = (to: string) => {
    if (isDirty) {
      setPendingNavigation(to);
      setShowExitDialog(true);
    } else {
      navigateRef.current(to);
    }
  };

  const guardedNavigate = (path: string) => {
    if (isDirty) {
      setPendingNavigation(path);
      setShowExitDialog(true);
    } else {
      navigate(path);
    }
  };

  const handleBackToList = () => {
    guardedNavigateDirect('/world-info');
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

  // Validation for final save (staged import)
  const hasInvalidStagedEntries = isStagedImport && stagedEntries.some(e => e.keywords.length === 0 || !e.entry_text.trim());

  // Override create/update to handle staged creation with entries
  const handleCreateOrUpdateWorldInfo = async () => {
    if (!editName.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (hasInvalidStagedEntries) {
      toast({ title: 'Error', description: 'Fill keywords and text for all entries or delete incomplete ones', variant: 'destructive' });
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

        // If this is a staged import, add the staged entries
        if (isStagedImport && worldInfoId) {
          for (const entry of stagedEntries) {
            try {
              const entryData: WorldInfoEntryData = {
                keywords: entry.keywords,
                entry_text: entry.entry_text
              };
              await addWorldInfoEntry(worldInfoId, entryData);
            } catch (entryError) {
              console.error('Error adding staged entry:', entryError);
            }
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

  // Replace add/update entry behavior for staged import
  const handleAddStagedEntry = () => {
    if (stagedEntries.length >= 100) {
      toast({ title: 'Limit Reached', description: 'Maximum of 100 entries allowed before creation', variant: 'destructive' });
      return;
    }
    if (!newEntryKeywords.trim() && !newEntryText.trim()) return;
    const keywords = getKeywordsArray(newEntryKeywords); // already limited
    setStagedEntries(prev => [...prev, { tempId: `new-${Date.now()}`, keywords, entry_text: newEntryText }]);
    setNewEntryKeywords('');
    setNewEntryText('');
  };

  const handleUpdateStagedEntry = (tempId: string, keywordsStr: string, text: string) => {
    const keywords = getKeywordsArray(processKeywordsInput(keywordsStr));
    setStagedEntries(prev => prev.map(e => e.tempId === tempId ? { ...e, keywords, entry_text: text.slice(0, 1000) } : e));
  };

  const handleDeleteStagedEntry = (tempId: string) => {
    setStagedEntries(prev => prev.filter(e => e.tempId !== tempId));
  };

  // Utility to scroll to first invalid staged entry
  const scrollToFirstInvalid = () => {
    setTimeout(() => {
      const el = document.querySelector('.border-red-500');
      if (el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  // Rendering source for entries (unified for staged & saved)
  const baseEntries: any[] = id ? (worldInfoDetails?.entries || []) : stagedEntries;
  const displayEntries = baseEntries.filter(entry => {
    if (!entriesSearchQuery) return true;
    const searchLower = entriesSearchQuery.toLowerCase();
    return (
      (entry.keywords || []).some((keyword: string) => keyword.toLowerCase().includes(searchLower)) ||
      (entry.entry_text || '').toLowerCase().includes(searchLower)
    );
  });
  // Reintroduce isEntryInvalid helper
  const isEntryInvalid = (entry: any) => ((entry.keywords || []).length === 0 || !(entry.entry_text || '').trim());

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isDirty) {
        e.preventDefault();
        history.pushState(null, '', window.location.href);
        setPendingNavigation('/world-info');
        setShowExitDialog(true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDirty]);

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

          {/* Mobile action button */}
          <div className="md:hidden px-4 pt-4 flex justify-end">
            <Button
              onClick={handleCreateOrUpdateWorldInfo}
              disabled={saving}
              size="sm"
              className="bg-primary hover:bg-primary/80 text-white font-medium flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{id ? 'Update' : 'Create'}</span>
            </Button>
          </div>

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
                    {id ? 'Lorebook Entries' : 'Staged Entries (not saved yet)'} ({displayEntries.length})
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={id ? 'Search entries...' : 'Search staged entries...'}
                      value={entriesSearchQuery}
                      onChange={(e) => setEntriesSearchQuery(e.target.value)}
                      className="pl-10 bg-gray-800/50 border-gray-600 text-white"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Invalid staged entries banner */}
                  {isStagedImport && hasInvalidStagedEntries && (
                    <div className="p-3 rounded-md border border-red-500 bg-red-500/10 text-sm text-red-300">
                      {stagedEntries.filter(e => e.keywords.length === 0 || !e.entry_text.trim()).length} incomplete entr{stagedEntries.filter(e => e.keywords.length === 0 || !e.entry_text.trim()).length === 1 ? 'y' : 'ies'}. All entries must have at least one keyword and text before creation.
                    </div>
                  )}
                  {/* Add New Entry Form */}
                  <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg border border-gray-600">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add New Entry
                    </h3>
                    {!id && (
                      <p className="text-sm text-gray-400">
                        These entries are staged. Complete keywords & text before creating.
                      </p>
                    )}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="new-entry-keywords" className="text-white">Keywords (comma-separated)</Label>
                        <Input
                          id="new-entry-keywords"
                          value={newEntryKeywords}
                          onChange={onNewKeywordsChange}
                          placeholder="keyword1, keyword2, keyword3"
                          className="bg-gray-800/50 border-gray-600 text-white"
                        />
                        <div className="text-xs text-gray-400 mt-1">{getKeywordsArray(newEntryKeywords).length} / 10 keywords (max 5 words each)</div>
                      </div>
                      <div>
                        <Label htmlFor="new-entry-text" className="text-white">Entry Text</Label>
                        <Textarea
                          id="new-entry-text"
                          value={newEntryText}
                          onChange={onNewEntryTextChange}
                          rows={4}
                          placeholder="Enter the content for this entry..."
                          className="bg-gray-800/50 border-gray-600 text-white"
                        />
                        <div className="text-xs text-gray-400 mt-1">{newEntryText.length} / 1000 characters</div>
                      </div>
                      <Button 
                        onClick={id ? handleAddEntry : handleAddStagedEntry} 
                        className="bg-primary hover:bg-primary/80"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Entry
                      </Button>
                    </div>
                  </div>

                  {/* Entries List */}
                  <div className="space-y-4">
                    {displayEntries.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No entries {id ? 'found' : 'staged'}</p>
                      </div>
                    ) : (
                      displayEntries.map((entry: any) => {
                        const invalid = isEntryInvalid(entry);
                        const entryId = entry.id || entry.tempId;
                        const editing = editingEntryId === entryId;
                        return (
                          <Card key={entryId} className={invalid ? 'border-red-500 bg-red-500/10' : 'bg-gray-900/50 border-gray-600'}>
                            <CardContent className="p-4">
                              {editing ? (
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-white">Keywords</Label>
                                    <Input
                                      value={editingEntryKeywords}
                                      onChange={onEditingKeywordsChange}
                                      className="bg-gray-800/50 border-gray-600 text-white"
                                    />
                                    <div className="text-xs text-gray-400 mt-1">{getKeywordsArray(editingEntryKeywords).length} / 10 keywords (max 5 words each)</div>
                                  </div>
                                  <div>
                                    <Label className="text-white">Entry Text</Label>
                                    <Textarea
                                      value={editingEntryText}
                                      onChange={onEditingEntryTextChange}
                                      rows={4}
                                      className="bg-gray-800/50 border-gray-600 text-white"
                                    />
                                    <div className="text-xs text-gray-400 mt-1">{editingEntryText.length} / 1000 characters</div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button onClick={id ? handleUpdateEntry : () => { handleUpdateStagedEntry(entryId, editingEntryKeywords, editingEntryText); setEditingEntryId(null); }} size="sm">
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
                                    <div className="flex flex-wrap gap-1">
                                      {(entry.keywords || []).map((k: string, i: number) => (
                                        <Badge key={i} variant="outline" className="text-xs border-gray-500 text-gray-300">
                                          {k}
                                        </Badge>
                                      ))}
                                      {entry.keywords.length === 0 && (
                                        <span className="text-xs text-red-400">No keywords</span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-300 whitespace-pre-wrap">
                                      {entry.entry_text || <span className="text-red-400">No text</span>}
                                    </p>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingEntryId(entryId); setEditingEntryKeywords(processKeywordsInput(entry.keywords.join(', '))); setEditingEntryText((entry.entry_text || '').slice(0,1000)); }} className="text-gray-400 hover:text-white p-2">
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => id ? handleDeleteEntry(entryId) : handleDeleteStagedEntry(entryId)} className="text-gray-400 hover:text-red-400 p-2">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
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

        {/* Unsaved changes dialog */}
        <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
          <DialogContent className="bg-[#1a1a2e] border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Discard changes?</DialogTitle>
            </DialogHeader>
            <p className="text-gray-300">You have unsaved changes. Continue editing or discard?</p>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" className="border-gray-600" onClick={() => setShowExitDialog(false)}>Continue Editing</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={() => { setShowExitDialog(false); if (pendingNavigation) navigateRef.current(pendingNavigation); }}>Discard</Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
