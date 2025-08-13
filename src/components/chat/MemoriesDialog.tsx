import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Calendar, MessageSquare, Coins, RefreshCw, Edit, Save, Trash2 } from 'lucide-react';
import { CharacterMemory } from '@/hooks/useCharacterMemories';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface MemoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memories: CharacterMemory[];
  loading: boolean;
  error: string | null;
  characterName: string;
  onRefresh: () => void;
}

// Simple stable hash for content de-dup (matches manual memory handler)
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export const MemoriesDialog: React.FC<MemoriesDialogProps> = ({
  open,
  onOpenChange,
  memories,
  loading,
  error,
  characterName,
  onRefresh
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedSummary, setEditedSummary] = useState('');
  const [editedKeywordsText, setEditedKeywordsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startEdit = (memory: CharacterMemory) => {
    setEditingId(memory.id);
    setEditedSummary(memory.summary_content || '');
    setEditedKeywordsText((memory.trigger_keywords || []).join(', '));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditedSummary('');
    setEditedKeywordsText('');
  };

  const parseKeywords = (text: string): string[] => {
    return text
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .slice(0, 10);
  };

  const handleSave = async (id: string) => {
    try {
      setSaving(true);
      const normalized = editedSummary.replace(/\s+/g, ' ').trim();
      const trigger_keywords = parseKeywords(editedKeywordsText);
      const { error: upErr } = await supabase
        .from('character_memories')
        .update({
          summary_content: normalized,
          trigger_keywords,
          content_hash: hashString(normalized),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (upErr) throw upErr;
      toast.success('Memory updated');
      cancelEdit();
      onRefresh();
    } catch (e: any) {
      console.error('Failed to update memory', e);
      toast.error('Failed to update memory', { description: e?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this memory? This cannot be undone.')) return;
    try {
      setDeletingId(id);
      const { error: delErr } = await supabase
        .from('character_memories')
        .delete()
        .eq('id', id);
      if (delErr) throw delErr;
      toast.success('Memory deleted');
      if (editingId === id) cancelEdit();
      onRefresh();
    } catch (e: any) {
      console.error('Failed to delete memory', e);
      toast.error('Failed to delete memory', { description: e?.message || 'Please try again.' });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white flex items-center space-x-2">
              <Brain className="w-5 h-5 text-[#FF7A00]" />
              <span>{characterName}'s Memories</span>
            </DialogTitle>
          </div>
          <DialogDescription className="text-gray-300">
            View, edit, or delete memories associated with this character. Use keywords to help trigger memory injection in chats.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading memories...
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
              <p className="text-red-200 mb-2">Failed to load memories</p>
              <p className="text-red-300 text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="mt-3 bg-transparent border-red-500/50 hover:bg-red-500/10 text-red-200"
              >
                Try Again
              </Button>
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-8">
              <Brain className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-gray-400 text-lg font-medium mb-2">No Memories Yet</h3>
              <p className="text-gray-500 text-sm">
                Start creating memories by using the "Create Memory" button during your conversations.
                <br />
                Memories help the character remember important details from your interactions.
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {memories.map((memory) => (
                <AccordionItem
                  key={memory.id}
                  value={memory.id}
                  className="border-gray-700/50"
                >
                  <AccordionTrigger className="px-1">
                    <div className="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="text-base font-semibold text-white">{memory.name}</h3>
                      {memory.trigger_keywords && memory.trigger_keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {memory.trigger_keywords.map((keyword, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="bg-[#FF7A00]/10 text-[#FF7A00] border border-[#FF7A00]/30 text-xs"
                            >
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-1">
                    <div className="bg-[#0f0f0f] border border-gray-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center flex-wrap gap-2 text-sm text-gray-400">
                          {memory.is_auto_summary && (
                            <Badge variant="outline" className="border-blue-400 text-blue-400 text-xs">Auto-Summary</Badge>
                          )}
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(memory.created_at)}</span>
                          <span className="text-gray-600">•</span>
                          <MessageSquare className="w-4 h-4" />
                          <span>{memory.message_count} messages</span>
                          <span className="text-gray-600">•</span>
                          <Coins className="w-4 h-4" />
                          <span>{memory.is_auto_summary ? 'Free' : `${memory.input_token_cost} credits`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {editingId === memory.id ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleSave(memory.id)}
                                disabled={saving}
                                className="bg-green-600 hover:bg-green-600/90 text-white"
                              >
                                <Save className="w-4 h-4 mr-1" /> Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEdit}
                                className="border-gray-600/50 text-gray-300 hover:bg-gray-800"
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(memory)}
                              className="border-gray-600/50 text-gray-300 hover:bg-gray-800"
                            >
                              <Edit className="w-4 h-4 mr-1" /> Edit
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(memory.id)}
                            disabled={deletingId === memory.id}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>

                      {editingId === memory.id ? (
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-white font-medium mb-2">Summary</h4>
                            <Textarea
                              value={editedSummary}
                              onChange={(e) => setEditedSummary(e.target.value)}
                              className="bg-[#121212] border-gray-700/50 text-gray-200"
                              rows={5}
                            />
                          </div>
                          <div>
                            <h4 className="text-white font-medium mb-2">Trigger Keywords</h4>
                            <Input
                              value={editedKeywordsText}
                              onChange={(e) => setEditedKeywordsText(e.target.value)}
                              placeholder="comma,separated,keywords"
                              className="bg-[#121212] border-gray-700/50 text-gray-200"
                            />
                            <p className="text-[11px] text-gray-500 mt-1">Separate keywords with commas. Max 10.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-1">
                          <h4 className="text-white font-medium mb-1">Summary</h4>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            {memory.summary_content}
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </ScrollArea>

        {memories.length > 0 && (
          <div className="border-t border-gray-700/50 pt-4">
            <p className="text-gray-400 text-sm text-center">
              <strong>{memories.length}</strong> memory{memories.length !== 1 ? 'ies' : ''} found
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
