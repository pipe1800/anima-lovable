import React, { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMessageTime } from "@/utils/messageGrouping";
import { ContextDisplay } from "./ContextDisplay";
import { FormattedMessage } from "@/components/ui/FormattedMessage";
import OptimizedMessageFormatter from "./OptimizedMessageFormatter";
import type { TrackedContext, Message, Character } from '@/types/chat';

interface MessageGroupData {
  id: string;
  messages: Message[];
  isUser: boolean;
  timestamp: Date;
  showTimestamp: boolean;
}

interface MessageGroupProps {
  group: MessageGroupData;
  character: Character;
  trackedContext?: TrackedContext;
  addonSettings?: {
    moodTracking?: boolean;
    clothingInventory?: boolean;
    locationTracking?: boolean;
    timeAndWeather?: boolean;
    relationshipStatus?: boolean;
    characterPosition?: boolean;
  };
}

// ✅ PHASE 3: Memoized component to prevent unnecessary re-renders
export const MessageGroup = memo(function MessageGroup({ group, character, trackedContext, addonSettings }: MessageGroupProps) {
  const { messages, isUser, showTimestamp } = group;

  return (
    <div className="mb-6">
      {showTimestamp && (
        <div className="text-center text-xs text-muted-foreground mb-4">
          {formatMessageTime(group.timestamp)}
        </div>
      )}
      
      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && (
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage src={character.avatar} alt={character.name} />
            <AvatarFallback>{character.fallback}</AvatarFallback>
          </Avatar>
        )}
        
        <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
          {messages.map((message, index) => (
            <div
              key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
              className={`px-4 py-2 text-sm ${
                isUser
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              } ${
                // Rounded corners based on position in group
                index === 0 && index === messages.length - 1
                  ? 'rounded-lg' // Single message
                  : index === 0
                  ? isUser
                    ? 'rounded-t-lg rounded-bl-lg rounded-br-sm'
                    : 'rounded-t-lg rounded-br-lg rounded-bl-sm'
                  : index === messages.length - 1
                  ? isUser
                    ? 'rounded-b-lg rounded-bl-lg rounded-br-sm'
                    : 'rounded-b-lg rounded-br-lg rounded-bl-sm'
                  : isUser
                  ? 'rounded-bl-lg rounded-br-sm'
                  : 'rounded-br-lg rounded-bl-sm'
              }`}
            >
              <FormattedMessage 
                content={message.content}
                className="whitespace-pre-wrap"
              />
              {/* Removed streaming indicator - no longer needed with simplified approach */}
            </div>
          ))}
        </div>
        
        {isUser && (
          <div className="w-8 h-8 flex-shrink-0" />
        )}
      </div>
      
      {/* Show context display for AI messages when addons are enabled - ONCE PER GROUP */}
      {!isUser && (
        <div className="mt-3 ml-11">
          {(() => {
            // Get the most recent message in the group for context
            const latestMessage = messages[messages.length - 1];
            
            const hasContextUpdates = latestMessage.contextUpdates && Object.keys(latestMessage.contextUpdates).length > 0;
            const hasCurrentContext = latestMessage.current_context && Object.keys(latestMessage.current_context).length > 0;
            const hasEnabledAddons = addonSettings && (
              addonSettings.moodTracking || 
              addonSettings.clothingInventory || 
              addonSettings.locationTracking || 
              addonSettings.timeAndWeather || 
              addonSettings.relationshipStatus ||
              addonSettings.characterPosition
            );
            
            console.log('🏷️ MessageGroup context check:', {
              hasContextUpdates,
              hasCurrentContext,
              hasEnabledAddons,
              latestMessageId: latestMessage.id,
              addonSettings,
              willShowContext: hasContextUpdates || hasCurrentContext || hasEnabledAddons
            });
            
            if (hasContextUpdates || hasCurrentContext || hasEnabledAddons) {
              return (
                <ContextDisplay 
                  context={trackedContext}
                  contextUpdates={latestMessage.contextUpdates} 
                  currentContext={trackedContext || latestMessage.current_context}
                  addonSettings={addonSettings}
                  className="mt-2"
                />
              );
            }
            return null;
          })()}
        </div>
      )}
    </div>
  );
}); // ✅ PHASE 3: Close memo function properly