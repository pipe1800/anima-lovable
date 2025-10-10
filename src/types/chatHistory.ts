export interface ChatHistoryCharacterSummary {
  id: string;
  name: string;
  avatar_url: string | null;
  short_description?: string | null;
  tagline?: string | null;
}

export interface ChatHistoryEntry {
  id: string;
  title: string | null;
  character: ChatHistoryCharacterSummary | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  userSettings?: {
    chat_mode?: 'storytelling' | 'companion' | null;
    time_awareness_enabled?: boolean | null;
  } | null;
  lastMessage?: string | null;
  messages?: Array<{ content?: string | null }> | null;
}
