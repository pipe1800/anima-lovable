// Lightweight token utilities (approximation: ~4 chars per token)
function estimateTokens(text) {
  if (!text) return 0;
  // normalize whitespace for more stable estimates
  const normalized = text.replace(/\s+/g, ' ').trim();
  return Math.ceil(normalized.length / 4);
}
function trimToTokenBudget(text, maxTokens) {
  if (!text) return '';
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return text;
  // approximate: tokens*4 chars
  const maxChars = Math.max(0, Math.floor(maxTokens * 4) - 3);
  return text.slice(0, maxChars).trimEnd() + '...';
}
/**
 * Context extraction utilities for CHARACTER AND WORLD INFO ONLY
 * This file handles general context extraction, NOT addon-specific context
 * Addon context extraction is handled by the separate extract-addon-context function
 */ /**
 * Extract consolidated context from multiple characters and world infos
 * This is the correct function for chat-management extract-context operation
 */ export async function extractInitialContext(charactersData, worldInfos, chatId, maxTokens = 4000) {
  console.log('🧠 Extracting initial context for multiple characters and world infos');
  console.log(`Characters: ${charactersData.length}, World Infos: ${worldInfos.length}, Max Tokens: ${maxTokens}`);
  // Budgets
  // Reserve some tokens for the model's response; keep within context window
  const reservedForResponse = Math.min(512, Math.floor(maxTokens * 0.2));
  const contextBudget = Math.max(0, maxTokens - reservedForResponse);
  // Permanent context budget (personality, notes, scenario, etc.)
  const permanentBudget = Math.floor(contextBudget * 0.6);
  let consolidatedContext = '';
  let tokenCount = 0; // total context tokens used so far
  let permanentTokenCount = 0; // subset used by permanent sections
  // Helper to add a labeled section under budgets
  const tryAddSection = (label, content, opts)=>{
    if (!content || !content.trim()) return;
    const section = `${label}: ${content}\n`;
    const sectionTokens = estimateTokens(section);
    if (opts.permanent) {
      const remainingPermanent = Math.max(0, permanentBudget - permanentTokenCount);
      if (remainingPermanent <= 0) return; // no room for permanent content
      // Trim to remaining permanent budget if necessary
      let sectionToAdd = section;
      let tokensToAdd = sectionTokens;
      if (sectionTokens > remainingPermanent) {
        const trimmed = trimToTokenBudget(section, remainingPermanent);
        tokensToAdd = estimateTokens(trimmed);
        if (tokensToAdd <= 0) return;
        sectionToAdd = trimmed.endsWith('\n') ? trimmed : trimmed + '\n';
      }
      // Also ensure we don't exceed total context budget
      const remainingTotal = Math.max(0, contextBudget - tokenCount);
      if (tokensToAdd > remainingTotal) {
        const trimmed = trimToTokenBudget(sectionToAdd, remainingTotal);
        const finalTokens = estimateTokens(trimmed);
        if (finalTokens <= 0) return;
        consolidatedContext += trimmed;
        tokenCount += finalTokens;
        permanentTokenCount += finalTokens;
        return;
      }
      consolidatedContext += sectionToAdd;
      tokenCount += tokensToAdd;
      permanentTokenCount += tokensToAdd;
      return;
    } else {
      // Variable content: ensure we don't exceed total budget
      const remainingTotal = Math.max(0, contextBudget - tokenCount);
      if (remainingTotal <= 0) return;
      let sectionToAdd = section;
      let tokensToAdd = sectionTokens;
      if (sectionTokens > remainingTotal) {
        const trimmed = trimToTokenBudget(section, remainingTotal);
        tokensToAdd = estimateTokens(trimmed);
        if (tokensToAdd <= 0) return;
        sectionToAdd = trimmed.endsWith('\n') ? trimmed : trimmed + '\n';
      }
      consolidatedContext += sectionToAdd;
      tokenCount += tokensToAdd;
      return;
    }
  };
  // Process characters
  if (charactersData && charactersData.length > 0) {
    consolidatedContext += '[CHARACTERS]\n';
    for (const character of charactersData){
      const header = `## ${character.name || 'Unknown Character'}\n`;
      const headerTokens = estimateTokens(header);
      // Ensure header can fit in remaining total budget
      if (tokenCount + headerTokens > contextBudget) {
        console.log(`⚠️ Reached token limit before character header: ${character.name}`);
        break;
      }
      consolidatedContext += header;
      tokenCount += headerTokens;
      // Permanent sections first
      tryAddSection('Description', character.description || '', {
        permanent: true
      });
      tryAddSection('Personality', character.personality || '', {
        permanent: true
      });
      tryAddSection('Scenario', character.scenario || '', {
        permanent: true
      });
      tryAddSection('Context', character.context || '', {
        permanent: true
      });
      // Variable sections (lowest priority)
      tryAddSection('First Message', character.first_message || '', {
        permanent: false
      });
      tryAddSection('Example Conversations', character.example_conversations || character.message_example || '', {
        permanent: false
      });
      // Spacer
      tryAddSection('', '', {
        permanent: false
      });
      if (tokenCount >= contextBudget) break;
    }
  }
  // Process world infos (variable content)
  if (worldInfos && worldInfos.length > 0 && tokenCount < contextBudget) {
    const sectionHeader = '[WORLD INFORMATION]\n';
    const headerTokens = estimateTokens(sectionHeader);
    if (tokenCount + headerTokens <= contextBudget) {
      consolidatedContext += sectionHeader;
      tokenCount += headerTokens;
      for (const worldInfo of worldInfos){
        const worldInfoSection = `## ${worldInfo.name}\n${worldInfo.content}\nKeywords: ${worldInfo.keywords.join(', ')}\n\n`;
        const sectionTokens = estimateTokens(worldInfoSection);
        const remainingTotal = Math.max(0, contextBudget - tokenCount);
        if (remainingTotal <= 0) break;
        if (sectionTokens > remainingTotal) {
          const trimmed = trimToTokenBudget(worldInfoSection, remainingTotal);
          const trimmedTokens = estimateTokens(trimmed);
          if (trimmedTokens <= 0) break;
          consolidatedContext += trimmed;
          tokenCount += trimmedTokens;
          break; // no more room after trimming
        }
        consolidatedContext += worldInfoSection;
        tokenCount += sectionTokens;
        if (tokenCount >= contextBudget) break;
      }
    }
  }
  console.log(`✅ Context extraction completed. Total estimated tokens: ${tokenCount} (permanent ~${permanentTokenCount}, reserved ${reservedForResponse})`);
  return {
    context: consolidatedContext,
    characterCount: charactersData.length,
    worldInfoCount: worldInfos.length,
    totalTokens: tokenCount
  };
}
/**
 * Extract character context for specific character operations
 * This is for character-specific context, not addon context
 */ export async function extractCharacterContext(character, templateContext, replaceTemplates) {
  console.log('🎭 Extracting character context for:', character.name);
  let context = '';
  // Add character name and basic info
  if (character.name) {
    context += `Character: ${character.name}\n`;
  }
  // Add character definitions if available
  if (character.character_definitions) {
    const def = character.character_definitions;
    if (def.personality_summary) {
      context += `Personality: ${replaceTemplates(def.personality_summary)}\n`;
      // Attempt to parse JSON to extract character_notes for model context
      try {
        const parsed = JSON.parse(def.personality_summary);
        const notes = parsed?.notes?.character_notes;
        if (typeof notes === 'string' && notes.trim().length > 0) {
          context += `Character Notes: ${replaceTemplates(notes)}\n`;
        }
      } catch (_err) {
      // Not JSON or no notes present; ignore
      }
    }
    if (def.description) {
      context += `Description: ${replaceTemplates(def.description)}\n`;
    }
    if (def.scenario) {
      const scenarioText = typeof def.scenario === 'string' ? def.scenario : JSON.stringify(def.scenario);
      context += `Scenario: ${replaceTemplates(scenarioText)}\n`;
    }
    if (def.greeting) {
      context += `Greeting: ${replaceTemplates(def.greeting)}\n`;
    }
  }
  console.log(`✅ Character context extracted (${context.length} characters)`);
  return context;
}
