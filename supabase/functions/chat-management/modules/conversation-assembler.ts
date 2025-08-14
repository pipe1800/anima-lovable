import type { 
  Character, 
  AddonSettings, 
  TemplateContext, 
  CurrentContext,
  SupabaseClient
} from '../types/streaming-interfaces.ts';
import { buildConversationMessagesWithMessageBudget, type ConversationKnobs } from './message-counter.ts';
import { buildSystemPrompt, type PromptMeta } from './message-handler.ts';

interface AssembleArgs {
  character: Character;
  addonSettings: AddonSettings;
  templateContext: TemplateContext;
  currentContext: CurrentContext;
  selectedPersona: { name?: string; bio?: string; lore?: string } | null;
  replaceTemplatesFn: (content: string) => string;
  supabase: SupabaseClient;
  worldInfoEntries?: Array<{ keywords: string[]; entry_text: string }> | null;
  userMessage: string;
  messageHistory: any[];
  characterMemories?: Array<{ id?: string; summary_content: string; trigger_keywords: string[]; created_at: string; updated_at?: string; last_injected_at?: string | null; injection_count?: number | null }> | null;
  chatMode?: 'storytelling' | 'companion';
  timeAwarenessData?: {
    enabled: boolean;
    delaySeconds: number;
    userTimezone: string;
    userLocalTime: string;
    conversationTone?: string;
    urgencyLevel?: string;
  };
  chatId: string;
  userId: string;
  maxContextTokens: number;
  knobs?: ConversationKnobs;
}

export async function assembleConversation(args: AssembleArgs) {
  const {
    character,
    addonSettings,
    templateContext,
    currentContext,
    selectedPersona,
    replaceTemplatesFn,
    supabase,
    worldInfoEntries,
    userMessage,
    messageHistory,
    characterMemories,
    chatMode,
    timeAwarenessData,
    chatId,
    userId,
    maxContextTokens,
    knobs
  } = args;

  // 1) Build system prompt (includes summary, world info, memories as per settings)
  let promptMeta: PromptMeta | undefined;
  const systemPrompt = await buildSystemPrompt(
    character,
    addonSettings,
    templateContext,
    currentContext,
    selectedPersona,
    replaceTemplatesFn,
    supabase,
    worldInfoEntries,
    userMessage,
    messageHistory,
    characterMemories || null,
    chatMode,
    timeAwarenessData,
    chatId,
    userId,
    (meta) => { promptMeta = meta; }
  );

  // 2) Build conversation messages under token budget
  const conversationResult = await buildConversationMessagesWithMessageBudget(
    systemPrompt,
    messageHistory,
    userMessage,
    maxContextTokens,
    chatId,
    supabase,
    knobs
  );

  return { systemPrompt, conversationResult, promptMeta };
}
