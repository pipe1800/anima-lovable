import React from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ChatHistoryListProps {
  loading: boolean;
  filteredChatHistory: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  currentChatId?: string;
  onSelectChat: (characterId: string, chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

const ChatHistoryListComponent: React.FC<ChatHistoryListProps> = ({
  loading,
  filteredChatHistory,
  searchQuery,
  setSearchQuery,
  currentChatId,
  onSelectChat,
  onDeleteChat,
}) => {
  return (
    <div className="p-4">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-[#1a1a2e] border-gray-700/50 text-white placeholder-gray-400 pl-10 text-sm focus:ring-[#FF7A00] focus:border-[#FF7A00]"
        />
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="text-gray-400 text-center py-4">Loading chats...</div>
        ) : filteredChatHistory.length === 0 ? (
          <div className="text-gray-400 text-center py-4">
            {searchQuery ? 'No chats match your search' : 'No chat history yet'}
          </div>
        ) : (
          filteredChatHistory.map((chat) => {
            const isActiveChat = chat.id === currentChatId;
            return (
              <div key={chat.id} className="relative group">
                <div
                  className={`p-3 rounded-lg transition-colors cursor-pointer ${
                    isActiveChat
                      ? 'bg-[#FF7A00]/30 border border-[#FF7A00]'
                      : 'bg-[#1a1a2e] border border-transparent hover:border-gray-600'
                  }`}
                  onClick={() => {
                    if (!isActiveChat) onSelectChat(chat.character?.id, chat.id);
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={chat.character?.avatar_url} alt={chat.character?.name} />
                      <AvatarFallback className="bg-[#FF7A00] text-white text-xs">
                        {chat.character?.name?.charAt(0) || 'C'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`font-medium text-sm truncate ${
                          isActiveChat ? 'text-white' : 'text-gray-300'
                        }`}>
                          {chat.title || chat.character?.name}
                        </h4>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-gray-400 hover:text-red-400"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-white">Delete chat?</AlertDialogTitle>
                              <AlertDialogDescription className="text-gray-300">
                                This will permanently delete the chat and its messages.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-gray-700 text-white hover:bg-gray-600">Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => onDeleteChat(chat.id)}
                                className="bg-red-600 text-white hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <p className={`text-xs truncate ${
                        isActiveChat ? 'text-gray-300' : 'text-gray-400'
                      }`}>
                        {chat.messages?.[0]?.content || 'No messages yet'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {chat.message_count ? `${chat.message_count} messages` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const ChatHistoryList = React.memo(ChatHistoryListComponent);
export default ChatHistoryList;
