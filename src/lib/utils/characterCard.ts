import logger from '@/utils/logger';

export interface CharacterCardData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  greeting?: string;
  example_dialogue?: string;
  tags?: string[];
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  character_book?: any;
  extensions?: any;
  spec?: string;
  spec_version?: string;
  data?: any;
  char_name?: string;
  char_persona?: string;
  world_scenario?: string;
  char_greeting?: string;
  example_dialogues?: Array<{ user: string; character: string }>;
  avatar?: string;
  chat?: string;
  create_date?: string;
  talkativeness?: string;
  fav?: boolean;
  [key: string]: any;
}

// Client-side parser removed in favor of server-side Edge Function `parse-character-card`.
// Keep this file as a placeholder for types or minimal helpers if needed.

export async function parseCharacterCard(_file: File): Promise<CharacterCardData | null> {
  logger.warn('parseCharacterCard is deprecated on the client. Use the Edge Function instead.');
  return null;
}

export function parseExampleDialogue(dialogueString: string | undefined): Array<{ user: string; character: string }> {
  // Kept for backward compatibility; prefer src/lib/dialogue.ts
  if (!dialogueString || typeof dialogueString !== 'string') return [];
  const dialogues: Array<{ user: string; character: string }> = [];
  const cleanedString = dialogueString
    .replace(/<START>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  const blocks = cleanedString.split(/\n\n+/).filter(b => b.trim());
  let currentUser = '';
  let currentChar = '';
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.match(/^(\{\{user\}\}|User|You):/i)) {
        if (currentUser && currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentChar = '';
        }
        currentUser = line.replace(/^(\{\{user\}\}|User|You):/i, '').trim();
      } else if (line.match(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/)) {
        currentChar = line.replace(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/, '').trim();
      } else if (line.trim()) {
        if (currentUser && !currentChar) {
          currentChar = line.trim();
        } else if (currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentUser = line.trim();
          currentChar = '';
        }
      }
    }
  }
  if (currentUser && currentChar) dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
  if (dialogues.length === 0 && blocks.length >= 2) {
    for (let i = 0; i < blocks.length - 1; i += 2) {
      dialogues.push({ user: blocks[i].trim(), character: blocks[i + 1]?.trim() || '' });
    }
  }
  return dialogues;
}