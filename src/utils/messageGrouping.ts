interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date | string;
  status?: 'sending' | 'sent' | 'failed';
}

interface NormalizedMessage extends Omit<Message, 'timestamp'> {
  timestamp: Date;
}

interface MessageGroup {
  id: string;
  messages: Message[];
  isUser: boolean;
  timestamp: Date;
  showTimestamp: boolean;
}

const MESSAGE_GROUP_TIME_THRESHOLD = 5 * 60 * 1000; // 5 minutes
// New: limit messages per group so rapid consecutive messages don't merge undesirably
const MAX_MESSAGES_PER_GROUP = 1; // set to 1 to force each message into its own bubble (adjust if needed)

export function groupMessages(messages: Message[]): MessageGroup[] {
  if (!messages.length) return [];
  const normalized: NormalizedMessage[] = messages.map(m => {
    let ts: Date;
    if (m.timestamp instanceof Date) ts = m.timestamp; else ts = new Date(m.timestamp as string);
    if (isNaN(ts.getTime())) ts = new Date();
    return { ...m, timestamp: ts } as NormalizedMessage;
  });

  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  normalized.forEach((message, index) => {
    const shouldStartNewGroup =
      !currentGroup ||
      currentGroup.isUser !== message.isUser ||
      (message.timestamp.getTime() - currentGroup.timestamp.getTime()) > MESSAGE_GROUP_TIME_THRESHOLD ||
      (currentGroup.messages.length >= MAX_MESSAGES_PER_GROUP);

    if (shouldStartNewGroup) {
      const prev = normalized[index - 1];
      const showTimestamp = index === 0 ||
        (index > 0 && (message.timestamp.getTime() - prev.timestamp.getTime()) > MESSAGE_GROUP_TIME_THRESHOLD);
      currentGroup = {
        id: `group-${message.id}`,
        messages: [message as any],
        isUser: message.isUser,
        timestamp: message.timestamp,
        showTimestamp
      };
      groups.push(currentGroup);
    } else {
      (currentGroup.messages as any).push(message);
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