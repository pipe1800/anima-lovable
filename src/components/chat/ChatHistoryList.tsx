import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChatCard } from '@/components/ui/chat-card';

interface ChatHistoryListProps {
  loading: boolean;
  filteredChatHistory: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  currentChatId?: string;
  onSelectChat: (characterId: string, chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

const PAGE_SIZE = 20;

const ChatHistoryListComponent: React.FC<ChatHistoryListProps> = ({
  loading,
  filteredChatHistory,
  searchQuery,
  setSearchQuery,
  currentChatId,
  onSelectChat,
  onDeleteChat,
}) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, filteredChatHistory.length]);

  const visibleChats = useMemo(() => (
    (filteredChatHistory || []).slice(0, visibleCount)
  ), [filteredChatHistory, visibleCount]);

  const hasMore = (filteredChatHistory?.length || 0) > visibleCount;

  return (
    <div className="p-4">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-[#1a1a2e] border-gray-700/50 text-white placeholder-gray-400 pl-10 text-sm focus:ring-[#FF7A00] focus:border-[#FF7A00]"
        />
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-gray-400 text-center py-4">Loading chats...</div>
        ) : filteredChatHistory.length === 0 ? (
          <div className="text-gray-400 text-center py-4">
            {searchQuery ? 'No chats match your search' : 'No chat history yet'}
          </div>
        ) : (
          <>
            {visibleChats.map((chat) => (
              <ChatCard
                key={chat.id}
                chat={{
                  id: chat.id,
                  character: {
                    id: chat.character?.id,
                    name: chat.character?.name || chat.title || 'Unknown',
                    image: chat.character?.avatar_url,
                    tagline: chat.character?.tagline || chat.character?.short_description,
                  },
                  title: chat.title,
                  message_count: chat.message_count,
                  last_message_at: chat.last_message_at,
                  created_at: chat.created_at,
                  chat_mode: chat.userSettings?.chat_mode,
                  time_awareness_enabled: chat.userSettings?.time_awareness_enabled,
                  last_message: chat.messages?.[0]?.content || chat.lastMessage || null,
                }}
                onContinue={() => {
                  if (chat.id !== currentChatId) onSelectChat(chat.character?.id, chat.id);
                }}
                onDelete={(chatId) => {
                  if (chatId === currentChatId) return; // Prevent deleting open chat
                  onDeleteChat(chatId);
                }}
              />
            ))}

            {/* Show More */}
            {hasMore && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  Show more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const ChatHistoryList = React.memo(ChatHistoryListComponent);
export default ChatHistoryList;
