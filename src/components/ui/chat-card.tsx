import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageCircle, Clock, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ChatCardProps {
  chat: {
    id: string;
    character: {
      id?: string;
      name: string;
      avatar?: string;
      image?: string;
      tagline?: string;
    };
    title?: string;
    message_count?: number;
    last_message_at?: string;
    created_at: string;
    chat_mode?: string;
    time_awareness_enabled?: boolean;
    last_message?: string | null;
    lastMessage?: string; // backwards compatibility
  };
  isSelected?: boolean;
  onSelect?: (chatId: string) => void;
  onContinue: (chat: any) => void;
  onDelete?: (chatId: string, event: React.MouseEvent) => void;
  showSelection?: boolean;
  isDetailed?: boolean;
}

export const ChatCard = React.memo(({ 
  chat, 
  isSelected = false, 
  onSelect, 
  onContinue,
  onDelete,
  showSelection = false,
  isDetailed = false
}: ChatCardProps) => {
  const handleContinueClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onContinue(chat);
  };

  const handleSelectionChange = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(chat.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(chat.id, e);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };

  const lastMessage = chat.last_message || chat.lastMessage;

  return (
    <Card 
      className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/10 cursor-pointer"
      onClick={handleContinueClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start space-x-4">
          {/* Selection Checkbox */}
          {showSelection && (
            <div onClick={handleSelectionChange}>
              <Checkbox
                checked={isSelected}
                onChange={() => {}} // Controlled by parent
                className="mt-2 border-gray-600"
              />
            </div>
          )}
          
          {/* Larger Avatar */}
          <Avatar className="w-14 h-14 ring-2 ring-gray-700 flex-shrink-0">
            <AvatarImage 
              src={chat.character.avatar || chat.character.image} 
              alt={chat.character.name}
              className="object-cover"
            />
            <AvatarFallback className="bg-[#FF7A00] text-white font-bold text-lg">
              {chat.character.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header with Character Name and Badges */}
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-semibold text-base truncate">
                  {chat.character.name}
                </h3>
                <div className="flex gap-1">
                  {chat.chat_mode && (
                    <Badge 
                      variant="outline" 
                      className="text-xs border-purple-500/50 text-purple-400"
                    >
                      {chat.chat_mode === 'companion' ? '👤' : '📖'} {chat.chat_mode}
                    </Badge>
                  )}
                  {chat.time_awareness_enabled && (
                    <Badge 
                      variant="outline" 
                      className="text-xs border-blue-500/50 text-blue-400"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Time Aware
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Delete Button */}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-red-400 hover:bg-red-900/20 h-8 w-8 p-0"
                  onClick={handleDeleteClick}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            
            {/* Last Message Preview */}
            {lastMessage && lastMessage !== "No messages yet" && (
              <p className="text-gray-400 text-sm line-clamp-2 mb-2">
                {lastMessage}
              </p>
            )}
            
            {/* Footer Info */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3 text-gray-500">
                <span className="flex items-center">
                  <MessageCircle className="w-3 h-3 mr-1" />
                  {chat.message_count || 0} messages
                </span>
                <span>
                  {formatDate(chat.last_message_at || chat.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

ChatCard.displayName = 'ChatCard';
