import { buildConversationMessagesWithMessageBudget } from './message-counter.ts';
import { buildSystemPrompt } from './message-handler.ts';
export async function assembleConversation(args) {
  const { character, addonSettings, templateContext, currentContext, selectedPersona, replaceTemplatesFn, supabase, worldInfoEntries, userMessage, messageHistory, characterMemories, chatMode, timeAwarenessData, chatId, userId, maxContextTokens, knobs } = args;
  // 1) Build system prompt (includes summary, world info, memories as per settings)
  let promptMeta;
  const systemPrompt = await buildSystemPrompt(character, addonSettings, templateContext, currentContext, selectedPersona, replaceTemplatesFn, supabase, worldInfoEntries, userMessage, messageHistory, characterMemories || null, chatMode, timeAwarenessData, chatId, userId, (meta)=>{
    promptMeta = meta;
  });
  // 2) Build conversation messages under token budget
  const conversationResult = await buildConversationMessagesWithMessageBudget(systemPrompt, messageHistory, userMessage, maxContextTokens, chatId, supabase, knobs);
  return {
    systemPrompt,
    conversationResult,
    promptMeta
  };
}
