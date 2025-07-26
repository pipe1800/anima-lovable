import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BookOpen, Plus, Search, Edit2, Trash2, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type WorldInfoEntry = Tables<'world_info_entries'>;

interface WorldInfoEntriesProps {
  entries: WorldInfoEntry[];
  onAdd: (entry: { keywords: string[]; entry_text: string }) => void;
  onUpdate: (entryId: string, entry: { keywords: string[]; entry_text: string }) => void;
  onDelete: (entryId: string) => void;
  canAddEntries: boolean;
}

export default function WorldInfoEntries({
  entries,
  onAdd,
  onUpdate,
  onDelete,
  canAddEntries
}: WorldInfoEntriesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKeywords, setEditKeywords] = useState('');
  const [editText, setEditText] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filter entries based on search
  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    
    const query = searchQuery.toLowerCase();
    return entries.filter(entry => 
      entry.keywords.some(k => k.toLowerCase().includes(query)) ||
      entry.entry_text.toLowerCase().includes(query)
    );
  }, [entries, searchQuery]);

  const handleAdd = () => {
    if (!newKeywords.trim() || !newText.trim()) return;

    const keywords = newKeywords.split(',').map(k => k.trim()).filter(k => k);
    onAdd({ keywords, entry_text: newText });
    
    // Reset form
    setNewKeywords('');
    setNewText('');
  };

  const startEdit = (entry: WorldInfoEntry) => {
    setEditingId(entry.id);
    setEditKeywords(entry.keywords.join(', '));
    setEditText(entry.entry_text);
  };

  const handleUpdate = () => {
    if (!editingId || !editKeywords.trim() || !editText.trim()) return;

    const keywords = editKeywords.split(',').map(k => k.trim()).filter(k => k);
    onUpdate(editingId, { keywords, entry_text: editText });
    
    // Reset edit state
    setEditingId(null);
    setEditKeywords('');
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditKeywords('');
    setEditText('');
  };

  return (
    <Card className="bg-[#1a1a2e] border-gray-700/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-white">
          <span className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Lorebook Entries ({entries.length})
          </span>
          
          {entries.length > 0 && (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <Input
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-48 sm:w-64 bg-gray-800/50 border-gray-600 text-white text-sm"
              />
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New Entry Form */}
        {canAddEntries ? (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 space-y-3">
              <div>
                <Label htmlFor="new-keywords" className="text-white text-sm">
                  Keywords (comma-separated)
                </Label>
                <Input
                  id="new-keywords"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  placeholder="e.g., dragon, fire breathing, ancient"
                  className="mt-1 bg-gray-700/50 border-gray-600 text-white text-sm"
                />
              </div>
              
              <div>
                <Label htmlFor="new-text" className="text-white text-sm">
                  Entry Text
                </Label>
                <Textarea
                  id="new-text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Describe the lore or information..."
                  rows={3}
                  className="mt-1 bg-gray-700/50 border-gray-600 text-white text-sm"
                />
              </div>
              
              <Button
                onClick={handleAdd}
                disabled={!newKeywords.trim() || !newText.trim()}
                size="sm"
                className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-4 text-gray-400 text-sm bg-gray-800/30 rounded-lg border border-gray-700">
            Save the world info first to add entries
          </div>
        )}

        {/* Entries List */}
        <div className="space-y-3">
          {filteredEntries.length === 0 && entries.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No entries yet</p>
              <p className="text-sm">Add your first entry above</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No entries match your search</p>
            </div>
          ) : (
            filteredEntries.map(entry => (
              <Card key={entry.id} className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-4">
                  {editingId === entry.id ? (
                    // Edit Mode
                    <div className="space-y-3">
                      <Input
                        value={editKeywords}
                        onChange={(e) => setEditKeywords(e.target.value)}
                        placeholder="Keywords"
                        className="bg-gray-700/50 border-gray-600 text-white text-sm"
                      />
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="bg-gray-700/50 border-gray-600 text-white text-sm"
                      />
                      <div className="flex gap-2">
                        <Button onClick={handleUpdate} size="sm">
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                        <Button onClick={cancelEdit} variant="outline" size="sm">
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {entry.keywords.map((keyword, idx) => (
                            <Badge 
                              key={idx} 
                              variant="secondary" 
                              className="text-xs bg-gray-700 text-gray-300"
                            >
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
                          onClick={() => startEdit(entry)}
                          className="text-gray-400 hover:text-white p-2"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteId(entry.id)}
                          className="text-gray-400 hover:text-red-400 p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Entry</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete this entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  onDelete(deleteId);
                  setDeleteId(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
