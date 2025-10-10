import { estimateTokens } from './message-counter.ts';
/**
 * PromptBuilder
 * Deterministic, sectioned system prompt builder for character chats.
 * This focuses on assembling sections. Selection (world info, memories) stays outside.
 */ export class PromptBuilder {
  character;
  replaceTemplates;
  sections = [];
  sectionTokens = {};
  budgets;
  constructor(args){
    this.character = args.character;
    this.replaceTemplates = args.replaceTemplates;
    // Default per-section token budgets (conservative)
    this.budgets = {
      preamble: args.budgets?.preamble ?? 60,
      core: args.budgets?.core ?? 800,
      style: args.budgets?.style ?? 180,
      persona: args.budgets?.persona ?? 220
    };
  }
  pushSection(label, content) {
    if (!content || content.trim().length === 0) return;
    this.sections.push({
      label,
      content
    });
    try {
      const t = estimateTokens(content);
      this.sectionTokens[label] = (this.sectionTokens[label] || 0) + t;
    } catch (tokenError) {
      console.warn('Failed to estimate tokens for section', tokenError);
    }
  }
  trimToTokenBudget(text, budgetTokens) {
    if (!text) return '';
    if (estimateTokens(text) <= budgetTokens) return text;
    // Binary search best substring length under token budget
    let low = 0;
    let high = text.length;
    let best = 0;
    while(low <= high){
      const mid = Math.floor((low + high) / 2);
      const slice = text.slice(0, mid);
      const tokens = estimateTokens(slice);
      if (tokens <= budgetTokens) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    let result = text.slice(0, best);
    // Soft cut on sentence boundary if possible
    const lastPunct = result.lastIndexOf('.');
    if (lastPunct > 50) result = result.slice(0, lastPunct + 1);
    return result;
  }
  addPreamble() {
    const nameOrSummary = this.character.personality_summary || 'a helpful assistant';
    const content = this.trimToTokenBudget(`You are ${this.replaceTemplates(nameOrSummary)}. Stay in character at all times.`, this.budgets.preamble);
    this.pushSection('preamble', content);
    return this;
  }
  addCharacterCore() {
    const { character } = this;
    const parts = [];
    parts.push('[CHARACTER CORE]');
    if (character.personality_summary) {
      parts.push(`Personality: ${this.replaceTemplates(character.personality_summary)}`);
    }
    if (character.description) {
      parts.push(`Description: ${this.replaceTemplates(character.description)}`);
    }
    if (character.scenario) {
      const scenario = typeof character.scenario === 'string' ? character.scenario : JSON.stringify(character.scenario);
      parts.push(`Scenario: ${this.replaceTemplates(scenario)}`);
    }
    parts.push('[/CHARACTER CORE]');
    let content = parts.join('\n');
    // Optional budget on core to prevent runaway prompts
    content = this.trimToTokenBudget(content, this.budgets.core);
    this.pushSection('core', content);
    return this;
  }
  addStyleProfile() {
    const c = this.character;
    const possibleStyle = c?.style_profile || c?.speech_style || c?.notes?.style || c?.character_definitions?.notes?.style || null;
    const styleStr = typeof possibleStyle === 'string' ? possibleStyle.trim() : null;
    if (styleStr && styleStr.length > 0) {
      const content = this.trimToTokenBudget(`[STYLE PROFILE]\n${this.replaceTemplates(styleStr)}\n[/STYLE PROFILE]`, this.budgets.style);
      this.pushSection('style', content);
    }
    return this;
  }
  addUserPersona(selectedPersona) {
    if (!selectedPersona || !selectedPersona.bio && !selectedPersona.lore) return this;
    const parts = [];
    parts.push('[USER PERSONA INFORMATION]');
    if (selectedPersona.bio) parts.push(`User Bio: ${selectedPersona.bio}`);
    if (selectedPersona.lore) parts.push(`User Background & Lore: ${selectedPersona.lore}`);
    parts.push('Respond to the user accordingly, taking their persona traits and background into consideration.');
    parts.push('[/USER PERSONA INFORMATION]');
    let content = parts.join('\n');
    content = this.trimToTokenBudget(content, this.budgets.persona);
    this.pushSection('persona', content);
    return this;
  }
  append(raw) {
    if (raw && raw.trim().length > 0) this.pushSection('append', raw);
    return this;
  }
  build() {
    const prompt = this.sections.map((s)=>s.content).join('\n\n');
    try {
      console.log('🧱 PromptBuilder built prompt', {
        length: prompt.length,
        tokens: estimateTokens(prompt)
      });
    } catch (tokenError) {
      console.warn('Failed to estimate tokens for section', tokenError);
    }
    return prompt;
  }
  getSectionTokens() {
    return {
      ...this.sectionTokens
    };
  }
}

