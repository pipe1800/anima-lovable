interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp?: Date | string; // made optional & allow string
  created_at?: string; // fallback field from DB rows
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

  messages.forEach((raw, index) => {
    // Assign stable fallback id if missing
    const safeId = (raw as any).id || `m-${raw.created_at || raw.timestamp || index}-${index}`;
    if (!(raw as any).id) (raw as any).id = safeId;
    // Normalize timestamp defensively
    let ts: Date;
    if (raw.timestamp instanceof Date) ts = raw.timestamp;
    else if (typeof raw.timestamp === 'string') ts = new Date(raw.timestamp);
    else if (raw.created_at) ts = new Date(raw.created_at);
    else ts = new Date();

    const message: Message & { timestamp: Date } = { ...raw, id: safeId, timestamp: ts } as any;

    // Guard invalid date
    if (isNaN(message.timestamp.getTime())) {
      message.timestamp = new Date();
    }

    const shouldStartNewGroup =
      !currentGroup ||
      currentGroup.isUser !== message.isUser ||
      (message.timestamp.getTime() - currentGroup.timestamp.getTime()) > MESSAGE_GROUP_TIME_THRESHOLD;

    if (shouldStartNewGroup) {
      const prev = messages[index - 1] as any;
      const prevTs = prev?.timestamp instanceof Date ? prev.timestamp : (prev?.created_at ? new Date(prev.created_at) : null);
      const showTimestamp = index === 0 || !prevTs || (message.timestamp.getTime() - prevTs.getTime()) > MESSAGE_GROUP_TIME_THRESHOLD;

      currentGroup = {
        id: `group-${safeId}`,
        messages: [message as any],
        isUser: message.isUser,
        timestamp: message.timestamp,
        showTimestamp
      };
      groups.push(currentGroup);
    } else {
      currentGroup.messages.push(message as any);
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