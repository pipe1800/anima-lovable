import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TopBar } from '@/components/ui/TopBar';
import { 
  BookOpen, 
  Save, 
  ArrowLeft, 
  Plus, 
  X, 
  Loader2,
  Globe,
  Lock,
  Eye,
  Search,
  Edit2,
  Trash2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  createWorldInfo as createWorldInfoRaw,
  updateWorldInfoCore,
  addWorldInfoEntry as addWorldInfoEntryRaw,
  updateWorldInfoEntry as updateWorldInfoEntryRaw,
  deleteWorldInfoEntry as deleteWorldInfoEntryRaw
} from '@/data/worldInfo/mutations';
// Removed deprecated worldInfo/tags import
// Minimal local types to decouple from legacy module
interface WorldInfoEditorProps { mode: 'create' | 'edit'; worldInfoId?: string; }
interface WorldInfoEntry { id: string; world_info_id: string; keywords: string[]; entry_text: string; created_at: string; updated_at: string; }
interface Tag { id: number; name: string; }

// Hooks (ensure they remain imported elsewhere)
import { useWorldInfoWithEntries, useWorldInfoTags } from '@/hooks/useWorldInfos';
import { useAllTags } from '@/hooks/useTags';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export default function WorldInfoEditor({ mode, worldInfoId }: WorldInfoEditorProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get imported world info from location state
  const importedWorldInfo = location.state?.importedWorldInfo;

  // Form state
  const [formData, setFormData] = useState({
    name: importedWorldInfo?.name || '',
    description: importedWorldInfo?.description || '',
    visibility: 'private' as 'private' | 'public' | 'unlisted'
  });

  // Entries state
  const [entries, setEntries] = useState<WorldInfoEntry[]>(
    importedWorldInfo?.entries?.map((entry: any, index: number) => ({
      id: `temp-${index}`,
      world_info_id: '',
      keywords: Array.isArray(entry.keywords) ? entry.keywords : entry.keywords?.split(',').map((k: string) => k.trim()) || [],
      entry_text: entry.entry_text || entry.text || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })) || []
  );
  const [newEntry, setNewEntry] = useState({ keywords: '', text: '' });
  const [editingEntry, setEditingEntry] = useState<{ id: string; keywords: string; text: string } | null>(null);
  const [entriesSearch, setEntriesSearch] = useState('');

  // Tags state
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Queries
  const { data: worldInfo, isLoading: isLoadingWorldInfo } = useWorldInfoWithEntries(
    worldInfoId || ''
  );

  const { data: worldInfoTags = [] } = useWorldInfoTags(worldInfoId || null);

  const { data: allTagsRaw = [] } = useAllTags();
  const allTags: Tag[] = (allTagsRaw as any[]).filter(t => t && typeof t === 'object' && 'id' in t && 'name' in t) as Tag[];

  // Track initial snapshot for dirty state
  const initialSnapshotRef = useRef<{ form: typeof formData; entries: any[]; tagIds: number[] } | null>(null);

  // Helper to create a comparable snapshot
  const createSnapshot = () => ({
    form: formData,
    entries: entries.map(e => ({ keywords: [...e.keywords].sort(), entry_text: e.entry_text })).sort((a,b)=>a.entry_text.localeCompare(b.entry_text)),
    tagIds: selectedTags.map(t => t.id).sort()
  });

  // Initialize snapshot after data load (edit) or first mount (create)
  useEffect(() => {
    if (mode === 'edit') {
      if (worldInfo) {
        initialSnapshotRef.current = createSnapshot();
      }
    } else {
      // create mode: set after first render (including imported data)
      if (!initialSnapshotRef.current) {
        initialSnapshotRef.current = createSnapshot();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, worldInfo]);

  const isDirty = (() => {
    if (!initialSnapshotRef.current) return false;
    const current = createSnapshot();
    return JSON.stringify(current) !== JSON.stringify(initialSnapshotRef.current);
  })();

  // Warn on browser refresh / close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    if (isDirty) window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Initialize form data when editing
  useEffect(() => {
    if (mode === 'edit' && worldInfo) {
      setFormData({
        name: worldInfo.name,
        description: worldInfo.short_description || '',
        visibility: worldInfo.visibility as 'private' | 'public' | 'unlisted'
      });
      
      // Set entries if they exist
      if (worldInfo.entries) {
        setEntries(worldInfo.entries);
      }
    }
  }, [mode, worldInfo]);

  // Initialize tags when editing
  useEffect(() => {
    if (mode === 'edit' && worldInfoTags) {
      setSelectedTags(worldInfoTags);
    }
  }, [mode, worldInfoTags]);

  // Show notification for imported data
  useEffect(() => {
    if (importedWorldInfo && mode === 'create') {
      toast({
        title: "Imported Data Loaded",
        description: `Loaded ${importedWorldInfo.entries?.length || 0} entries from imported file`
      });
    }
  }, [importedWorldInfo, mode, toast]);

  // Handlers
  const handleAddEntry = () => {
    if (!newEntry.keywords.trim() || !newEntry.text.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both keywords and entry text",
        variant: "destructive"
      });
      return;
    }

    const keywords = newEntry.keywords.split(',').map(k => k.trim()).filter(k => k);
    const tempEntry: WorldInfoEntry = {
      id: `temp-${Date.now()}`,
      world_info_id: worldInfoId || '',
      keywords,
      entry_text: newEntry.text,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setEntries(prev => [...prev, tempEntry]);
    setNewEntry({ keywords: '', text: '' });

    toast({
      title: "Entry Added",
      description: "The entry will be saved when you save the world info"
    });
  };

  const handleUpdateEntry = () => {
    if (!editingEntry || !editingEntry.keywords.trim() || !editingEntry.text.trim()) return;

    const keywords = editingEntry.keywords.split(',').map(k => k.trim()).filter(k => k);
    
    setEntries(prev => prev.map(entry => 
      entry.id === editingEntry.id 
        ? { ...entry, keywords, entry_text: editingEntry.text }
        : entry
    ));

    setEditingEntry(null);
  };

  const handleDeleteEntry = (entryId: string) => {
    setEntries(prev => prev.filter(entry => entry.id !== entryId));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the world info",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const worldInfoData: any = {
        name: formData.name.trim(),
        short_description: formData.description.trim(),
        visibility: formData.visibility
      };

      let savedWorldInfoId = worldInfoId;

      if (mode === 'create') {
        // Create new world info
        const newWorldInfoResult = await createWorldInfoRaw(worldInfoData);
        if (newWorldInfoResult.error || !newWorldInfoResult.data) throw newWorldInfoResult.error || new Error('Create failed');
        const newWorldInfo = newWorldInfoResult.data;
        savedWorldInfoId = newWorldInfo.id;
        // TODO: re-add tag assignment via new interaction helper if required
        // Add entries
        for (const entry of entries) {
          if (!entry.id.startsWith('temp-')) continue;
          await addWorldInfoEntryRaw(savedWorldInfoId, {
            keywords: entry.keywords,
            entry_text: entry.entry_text
          });
        }
        toast({
          title: "Success",
          description: "World info created successfully"
        });
        // Navigate to edit mode
        navigate(`/world-info/${savedWorldInfoId}/edit`, { replace: true });
      } else {
        // Update existing world info
        await updateWorldInfoCore(savedWorldInfoId!, worldInfoData);

        // Handle entry updates
        for (const entry of entries) {
          if (entry.id.startsWith('temp-')) {
            // New entry
            await addWorldInfoEntryRaw(savedWorldInfoId!, {
              keywords: entry.keywords,
              entry_text: entry.entry_text
            });
          }
        }

        toast({
          title: "Success",
          description: "World info updated successfully"
        });
      }

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      if (savedWorldInfoId) {
        await queryClient.invalidateQueries({ queryKey: ['world-info', savedWorldInfoId] });
        await queryClient.invalidateQueries({ queryKey: ['world-info-entries', savedWorldInfoId] });
      }
    } catch (error) {
      console.error('Error saving world info:', error);
      toast({
        title: "Error",
        description: "Failed to save world info",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredEntries = entries.filter(entry => {
    if (!entriesSearch) return true;
    const searchLower = entriesSearch.toLowerCase();
    return (
      entry.keywords.some(k => k.toLowerCase().includes(searchLower)) ||
      entry.entry_text.toLowerCase().includes(searchLower)
    );
  });

  const isLoading = mode === 'edit' && isLoadingWorldInfo;

  // Leave confirmation dialog handlers
  const attemptNavigateAway = () => {
    if (isDirty) {
      setShowLeaveDialog(true);
    } else {
      navigate('/world-info');
    }
  };

  const confirmLeave = () => {
    setShowLeaveDialog(false);
    initialSnapshotRef.current = null; // prevent further prompts
    navigate('/world-info');
  };

  const stayEditing = () => setShowLeaveDialog(false);

  return (
    <div className="min-h-screen bg-[#121212]">
      <TopBar
        title={mode === 'create' ? 'Create World Info' : `Edit ${worldInfo?.name || 'World Info'}`}
        leftContent={
          <Button
            variant="ghost"
            size="sm"
            onClick={attemptNavigateAway}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        }
        rightContent={
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        }
      />
      {/* Mobile Action Bar (separate because TopBar mobile layout hides rightContent) */}
      <div className="sm:hidden px-4 mt-2">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={attemptNavigateAway}
            className="border-gray-600 text-gray-300"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 min-w-[90px] flex justify-center"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="ml-1">{mode === 'create' ? 'Create' : 'Save'}</span>
          </Button>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
          </div>
        ) : (
          <div className="space-y-10">
            {/* World Info Details */}
            <Card className="bg-transparent border-0 shadow-none sm:bg-gray-800/50 sm:border sm:border-gray-700">
              <CardHeader className="p-0 sm:p-6">
                <CardTitle className="text-white sm:mb-0 mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[#FF7A00]" />
                  World Info Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-0 sm:p-6">
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="name" className="text-white">
                      Name <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter world info name"
                      className="mt-1 bg-gray-800/50 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description" className="text-white">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of this world"
                      rows={3}
                      className="mt-1 bg-gray-800/50 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="visibility" className="text-white">Visibility</Label>
                    <Select 
                      value={formData.visibility} 
                      onValueChange={(value: 'public' | 'unlisted' | 'private') => 
                        setFormData(prev => ({ ...prev, visibility: value }))
                      }
                    >
                      <SelectTrigger className="mt-1 bg-gray-800/50 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            Private
                          </div>
                        </SelectItem>
                        <SelectItem value="unlisted">
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            Unlisted
                          </div>
                        </SelectItem>
                        <SelectItem value="public">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            Public
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-white mb-2 block">Tags</Label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedTags.map(tag => (
                      <Badge
                        key={tag.id}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setSelectedTags(prev => prev.filter(t => t.id !== tag.id))}
                      >
                        {tag.name}
                        <X className="w-3 h-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                  {allTags.filter(tag => !selectedTags.some(t => t.id === tag.id)).length > 0 && (
                    <Select
                      onValueChange={(value) => {
                        const tag = allTags.find(t => t.id.toString() === value);
                        if (tag) setSelectedTags(prev => [...prev, tag]);
                      }}
                    >
                      <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                        <SelectValue placeholder="Add a tag..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allTags
                          .filter(tag => !selectedTags.some(t => t.id === tag.id))
                          .map(tag => (
                            <SelectItem key={tag.id} value={tag.id.toString()}>
                              {tag.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>
            {/* Entries Section */}
            <Card className="bg-transparent border-0 shadow-none sm:bg-gray-800/50 sm:border sm:border-gray-700">
              <CardHeader className="p-0 sm:p-6">
                <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white">
                  <span className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-[#FF7A00]" /> Entries ({filteredEntries.length})</span>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search entries..."
                      value={entriesSearch}
                      onChange={(e) => setEntriesSearch(e.target.value)}
                      className="pl-10 bg-gray-800/50 border-gray-600 text-white"
                    />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-0 sm:p-6">
                <div className="p-0 border-0 bg-transparent sm:p-4 sm:bg-gray-900/50 sm:rounded-lg sm:border sm:border-gray-600 space-y-4">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add New Entry
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="new-keywords" className="text-white">
                        Keywords (comma-separated)
                      </Label>
                      <Input
                        id="new-keywords"
                        value={newEntry.keywords}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, keywords: e.target.value }))}
                        placeholder="keyword1, keyword2, keyword3"
                        className="mt-1 bg-gray-800/50 border-gray-600 text-white"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-text" className="text-white">Entry Text</Label>
                      <Textarea
                        id="new-text"
                        value={newEntry.text}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, text: e.target.value }))}
                        rows={4}
                        placeholder="Enter the content for this entry..."
                        className="mt-1 bg-gray-800/50 border-gray-600 text-white"
                      />
                    </div>
                    <Button onClick={handleAddEntry} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Entry
                    </Button>
                  </div>
                </div>
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No entries yet</p>
                    <p className="text-sm">Add your first entry above</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredEntries.map(entry => (
                      <Card key={entry.id} className="bg-transparent border-0 sm:bg-gray-900/50 sm:border sm:border-gray-600">
                        <CardContent className="p-0 sm:p-4">
                          {editingEntry?.id === entry.id ? (
                            <div className="space-y-4 p-4 sm:p-0">
                              <Input
                                value={editingEntry.keywords}
                                onChange={(e) => setEditingEntry(prev => prev ? { ...prev, keywords: e.target.value } : null)}
                                className="bg-gray-800/50 border-gray-600 text-white"
                              />
                              <Textarea
                                value={editingEntry.text}
                                onChange={(e) => setEditingEntry(prev => prev ? { ...prev, text: e.target.value } : null)}
                                rows={4}
                                className="bg-gray-800/50 border-gray-600 text-white"
                              />
                              <div className="flex gap-2">
                                <Button onClick={handleUpdateEntry} size="sm">
                                  <Save className="w-4 h-4 mr-1" />
                                  Save
                                </Button>
                                <Button onClick={() => setEditingEntry(null)} variant="outline" size="sm">
                                  <X className="w-4 h-4 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-4 p-4 sm:p-0">
                              <div className="flex-1 space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {entry.keywords.map((keyword, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {keyword}
                                    </Badge>
                                  ))}
                                </div>
                                <p className="text-sm text-gray-300 whitespace-pre-wrap">
                                  {entry.entry_text}
                                </p>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingEntry({
                                    id: entry.id,
                                    keywords: entry.keywords.join(', '),
                                    text: entry.entry_text
                                  })}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      {/* Leave confirmation dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={(o) => !o && setShowLeaveDialog(false)}>
        <DialogContent className="sm:max-w-md bg-[#1a1a2e] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Unsaved Changes</DialogTitle>
            <DialogDescription className="text-gray-300">
              You have unsaved changes. Do you want to keep editing or discard them?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button onClick={stayEditing} variant="outline" className="border-gray-600 text-gray-200 w-full sm:w-auto">Keep Editing</Button>
            <Button onClick={confirmLeave} variant="destructive" className="w-full sm:w-auto">Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
