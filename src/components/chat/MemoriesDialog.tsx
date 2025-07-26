import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Calendar, MessageSquare, Coins, X, RefreshCw } from 'lucide-react';
import { CharacterMemory } from '@/hooks/useCharacterMemories';

interface MemoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memories: CharacterMemory[];
  loading: boolean;
  error: string | null;
  characterName: string;
  onRefresh: () => void;
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
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                disabled={loading}
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
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
            <div className="space-y-4">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="bg-[#0f0f0f] border border-gray-700/50 rounded-lg p-4 hover:border-gray-600/50 transition-colors"
                >
                  {/* Memory Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      {memory.is_auto_summary && (
                        <Badge variant="outline" className="border-blue-400 text-blue-400 text-xs">
                          Auto-Summary
                        </Badge>
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
                  </div>

                  {/* Memory Title */}
                  <h3 className="text-lg font-semibold text-white mb-2">{memory.name}</h3>
                  
                  {/* Memory Summary */}
                  <div className="mb-3">
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {memory.summary_content}
                    </p>
                  </div>

                  {/* Trigger Keywords */}
                  {memory.trigger_keywords && memory.trigger_keywords.length > 0 && (
                    <div>
                      <h4 className="text-white font-medium mb-2">Trigger Keywords</h4>
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
                    </div>
                  )}
                </div>
              ))}
            </div>
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
