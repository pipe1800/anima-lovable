import { callEdgeFunction } from './core/client';

export interface GetCharacterMemoriesArgs {
  characterId: string;
  userId: string;
}

export interface CharacterMemoryRecord {
  id: string;
  chat_id: string;
  name: string;
  summary_content: string;
  trigger_keywords: string[];
  message_count: number;
  input_token_cost: number;
  is_auto_summary: boolean;
  created_at: string;
  updated_at: string;
}

export interface GetCharacterMemoriesResponse {
  success: boolean;
  data?: CharacterMemoryRecord[];
  error?: string;
}

export function getCharacterMemories(args: GetCharacterMemoriesArgs) {
  return callEdgeFunction<GetCharacterMemoriesResponse>('get-character-memories', {
    characterId: args.characterId,
    userId: args.userId
  });
}

export default getCharacterMemories;
