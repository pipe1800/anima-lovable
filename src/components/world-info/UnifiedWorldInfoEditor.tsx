import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { 
  useWorldInfoWithEntries, 
  useAllTags, 
  useWorldInfoTags
} from '@/hooks/useWorldInfos';
import type { Tables } from '@/integrations/supabase/types';

type WorldInfoEntry = Tables<'world_info_entries'>;
type Tag = Tables<'tags'>;

interface UnifiedWorldInfoEditorProps {
  mode: 'create' | 'edit';
  worldInfoId?: string;
}

export default function UnifiedWorldInfoEditor({ mode, worldInfoId }: UnifiedWorldInfoEditorProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    visibility: 'private' as 'private' | 'public' | 'unlisted'
  });

  // Entries state
  const [entries, setEntries] = useState<WorldInfoEntry[]>([]);
  const [newEntry, setNewEntry] = useState({ keywords: '', text: '' });
  const [editingEntry, setEditingEntry] = useState<{ id: string; keywords: string; text: string } | null>(null);
  const [entriesSearch, setEntriesSearch] = useState('');

  // Tags state
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState('basics');
  const [isSaving, setIsSaving] = useState(false);

  // Queries
  const { data: worldInfo, isLoading: isLoadingWorldInfo } = useWorldInfoWithEntries(
    worldInfoId || ''
  );

  const { data: worldInfoTags = [] } = useWorldInfoTags(worldInfoId || null);

  const { data: allTags = [] } = useAllTags();

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
      const worldInfoData: WorldInfoCreationData = {
        name: formData.name.trim(),
        short_description: formData.description.trim(),
        visibility: formData.visibility
      };

      let savedWorldInfoId = worldInfoId;

      if (mode === 'create') {
        // Create new world info
        const newWorldInfo = await createWorldInfo(worldInfoData);
        savedWorldInfoId = newWorldInfo.id;

        // Add tags
        for (const tag of selectedTags) {
          await addWorldInfoTag(savedWorldInfoId, tag.id);
        }

        // Add entries
        for (const entry of entries) {
          if (!entry.id.startsWith('temp-')) continue;
          await addWorldInfoEntry(savedWorldInfoId, {
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
        await updateWorldInfo(savedWorldInfoId!, worldInfoData);

        // Handle entry updates
        for (const entry of entries) {
          if (entry.id.startsWith('temp-')) {
            // New entry
            await addWorldInfoEntry(savedWorldInfoId!, {
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

  return (
    <div className="min-h-screen bg-[#121212]">
      <TopBar
        title={mode === 'create' ? 'Create World Info' : `Edit ${worldInfo?.name || 'World Info'}`}
        leftContent={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/world-info')}
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

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800/50">
              <TabsTrigger value="basics">Basic Info</TabsTrigger>
              <TabsTrigger value="entries">Entries ({filteredEntries.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="space-y-6">
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">World Info Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Name and Description */}
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

                  {/* Tags Section */}
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
            </TabsContent>

            <TabsContent value="entries" className="space-y-6">
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white">
                    <span>Lorebook Entries</span>
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
                <CardContent className="space-y-6">
                  {/* Add New Entry */}
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-600 space-y-4">
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

                  {/* Entries List */}
                  {filteredEntries.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No entries yet</p>
                      <p className="text-sm">Add your first entry above</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredEntries.map(entry => (
                        <Card key={entry.id} className="bg-gray-900/50 border-gray-600">
                          <CardContent className="p-4">
                            {editingEntry?.id === entry.id ? (
                              <div className="space-y-4">
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
                              <div className="flex items-start justify-between gap-4">
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
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
