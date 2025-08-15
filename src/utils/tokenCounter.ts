import type { CharacterFormData } from '@/hooks/useCharacterCreation';

// Client-side token estimation aligned with server (approx ~4 chars per token)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s+/g, ' ').trim();
  return Math.ceil(normalized.length / 4);
}

export function getPlanMaxTokens(planName?: string | null): number {
  // Hard universal limit
  return 3500;
}

function buildPersonalitySummaryJSON(form: CharacterFormData): any {
  return {
    personality: {
      core_personality: form.personality?.core_personality || '',
      tags: form.personality?.tags || [],
      knowledge_base: form.personality?.knowledge_base || '',
      scenario_definition: form.personality?.scenario_definition || ''
    },
    dialogue: {
      // Note: greeting saved separately in DB, keep examples here if present (as persisted in summary)
      example_dialogues: form.dialogue?.example_dialogues || [],
      alternate_greetings: form.dialogue?.alternate_greetings || []
    },
    title: form.title || '',
    version: form.version || '',
    notes: {
      character_notes: form.notes?.character_notes || '',
      creator_notes: form.notes?.creator_notes || ''
    }
  };
}

export type CreatorTokenEstimate = {
  totals: {
    maxTokens: number;
    reservedForResponse: number;
    contextBudget: number;
    permanentBudget: number;
    permanentUsed: number;
    variableUsed: number;
    totalUsed: number;
    overPermanent: boolean;
    overTotal: boolean;
  };
  breakdown: {
    personalitySummary: number;
    description: number;
    scenario: number;
    characterNotes: number;
    greeting: number;
  };
};

export function estimateCreatorTokenUsage(form: CharacterFormData, planName?: string | null, overrideGreeting?: string): CreatorTokenEstimate {
  const maxTokens = getPlanMaxTokens(planName);
  const reservedForResponse = 0; // removed
  const contextBudget = maxTokens; // full budget usable
  const permanentBudget = maxTokens; // treat all as single pool

  // Build sections similar to server extractCharacterContext
  const personalitySummaryStr = `Personality: ${JSON.stringify(buildPersonalitySummaryJSON(form))}`;
  const descriptionStr = form.personality?.core_personality ? `Description: ${form.personality.core_personality}` : '';
  const scenarioStr = form.personality?.scenario_definition ? `Scenario: ${form.personality.scenario_definition}` : '';
  const characterNotesStr = form.notes?.character_notes ? `Character Notes: ${form.notes.character_notes}` : '';
  const greetingText = (overrideGreeting ?? form.dialogue?.greeting) || '';
  const greetingStr = greetingText ? `Greeting: ${greetingText}` : '';

  const personalitySummaryTokens = estimateTokens(personalitySummaryStr);
  const descriptionTokens = estimateTokens(descriptionStr);
  const scenarioTokens = estimateTokens(scenarioStr);
  const characterNotesTokens = estimateTokens(characterNotesStr);
  const greetingTokens = estimateTokens(greetingStr);

  const permanentUsedRaw = personalitySummaryTokens + descriptionTokens + scenarioTokens + characterNotesTokens + greetingTokens;
  const overTotal = permanentUsedRaw > contextBudget;
  const totalUsed = Math.min(permanentUsedRaw, contextBudget);

  return {
    totals: {
      maxTokens,
      reservedForResponse,
      contextBudget,
      permanentBudget,
      permanentUsed: Math.min(permanentUsedRaw, permanentBudget),
      variableUsed: 0, // no variable segment now
      totalUsed,
      overPermanent: overTotal, // same concept since single pool
      overTotal,
    },
    breakdown: {
      personalitySummary: personalitySummaryTokens,
      description: descriptionTokens,
      scenario: scenarioTokens,
      characterNotes: characterNotesTokens,
      greeting: greetingTokens,
    }
  };
}
