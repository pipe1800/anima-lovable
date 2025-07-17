interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'failed';
}

interface MessageGroup {
  id: string;
  messages: Message[];
  isUser: boolean;
  timestamp: Date;
  showTimestamp: boolean;
}

const MESSAGE_GROUP_TIME_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export function groupMessages(messages: Message[]): MessageGroup[] {
  if (!messages.length) return [];

  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  messages.forEach((message, index) => {
    const shouldStartNewGroup = 
      !currentGroup || 
      currentGroup.isUser !== message.isUser ||
      (message.timestamp.getTime() - currentGroup.timestamp.getTime()) > MESSAGE_GROUP_TIME_THRESHOLD;

    if (shouldStartNewGroup) {
      // Determine if we should show timestamp
      const showTimestamp = index === 0 || 
        (index > 0 && (message.timestamp.getTime() - messages[index - 1].timestamp.getTime()) > MESSAGE_GROUP_TIME_THRESHOLD);

      currentGroup = {
        id: `group-${message.id}`,
        messages: [message],
        isUser: message.isUser,
        timestamp: message.timestamp,
        showTimestamp
      };
      groups.push(currentGroup);
    } else {
      currentGroup.messages.push(message);
    }
  });

  return groups;
}

export function formatMessageTime(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return timestamp.toLocaleDateString();
}