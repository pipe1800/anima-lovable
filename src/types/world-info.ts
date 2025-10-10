export type WorldInfoTag = string | { id?: number; name: string };

export interface WorldInfoSummaryItem {
  id: string;
  name: string;
  short_description?: string | null;
  avatar_url?: string | null;
  visibility?: 'public' | 'private' | 'unlisted' | string;
  creator_id?: string;
  tags?: WorldInfoTag[];
  creator?: { username?: string | null; avatar_url?: string | null } | null;
  profiles?: { username?: string | null; avatar_url?: string | null } | null;
  world_info_entries?: Array<{ id: string; keywords?: string[]; entry_text?: string }>;
  entriesCount?: number;
  entry_count?: number;
  likesCount?: number;
  likes_count?: number;
  like_count?: number;
  usage_count?: number;
  interaction_count?: number;
  created_at?: string;
  updated_at?: string | null;
}

export interface ImportedWorldInfoEntry {
  keywords?: string[] | string;
  entry_text?: string;
  text?: string;
  content?: string;
}

export interface ImportedWorldInfoPayload {
  name?: string;
  description?: string;
  entries?: ImportedWorldInfoEntry[];
}
