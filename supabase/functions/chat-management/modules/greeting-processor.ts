/**
 * Greeting Processor Module
 * 
 * Handles greeting generation, template replacement, context integration,
 * and complete chat creation with greeting functionality.
 */

import { fetchCharacterData, getBestPersonaForNewChat } from './database.ts';
import { mapGlobalSettingsToAddonSettings, sanitizeAddonSettings, anyAddonEnabled } from '../../_shared/settings-mapper.ts';
import type { AddonSettings } from '../types/streaming-interfaces.ts';
import type { CreateWithGreetingRequest, ChatResponse } from '../types/index.ts';
import type { TemplateContext } from '../types/streaming-interfaces.ts';
import { buildTemplateReplacer } from './database.ts';

export interface TemplateReplacer {
  (content: string): string;
}

export interface GreetingProcessingResult {
  processedGreeting: string;
  messageContext: Record<string, any>;
}

/**
 * Create template replacement function
 */
export function createTemplateReplacer(
  userPersona: any,
  userProfile: any,
  characterName: string
): TemplateReplacer {
  const context: TemplateContext = {
    userName: userPersona?.name || userProfile?.username || 'User',
    charName: characterName || 'Character'
  };
  return buildTemplateReplacer(context);
}

/**
 * Safely parse personality_summary JSON and return alternate greetings, if any
 */
function getAlternateGreetingsFromDefinition(character: any): string[] {
  try {
    const raw = character?.character_definitions?.personality_summary;
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const alts: unknown = parsed?.dialogue?.alternate_greetings;
    if (Array.isArray(alts)) {
      return alts
        .map((g) => (typeof g === 'string' ? g.trim() : ''))
        .filter((g) => !!g);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Generate processed greeting from character definitions
 */
export function generateGreeting(
  character: any,
  characterName: string,
  templateReplacer: TemplateReplacer
): string {
  const baseGreeting =
    character.character_definitions?.greeting ||
    `Hello! I'm ${characterName}. It's great to meet you. What would you like to talk about?`;

  // Include alternates if present in personality_summary JSON
  const alternates = getAlternateGreetingsFromDefinition(character);
  const candidates = [baseGreeting, ...alternates]
    .map((g) => (typeof g === 'string' ? g.trim() : ''))
    .filter((g) => !!g);

  // Pick random greeting from candidates
  const chosen = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : baseGreeting;
  
  return templateReplacer(chosen);
}

/**
 * Build message context from initial context and addon settings
 */
export function buildMessageContext(
  initialContext: Record<string, any> | null,
  addonSettings: AddonSettings | undefined
): Record<string, any> {
  const messageContext: Record<string, any> = {};
  if (initialContext && addonSettings) {
    Object.entries(initialContext).forEach(([field, value]) => {
      if (value && value !== 'No context') {
        // Map context fields to addon setting keys
        const contextKey = mapContextFieldToAddonKey(field);
        if (contextKey && (addonSettings as any)[contextKey]) {
          messageContext[contextKey] = value;
        }
      }
    });
  }
  return messageContext;
}

/**
 * Map context field names to addon setting keys
 */
function mapContextFieldToAddonKey(field: string): string | null {
  const fieldMapping: Record<string, string> = {
    'mood': 'moodTracking',
    'clothing': 'clothingInventory',
    'location': 'locationTracking',
    'time_weather': 'timeAndWeather',
    'relationship': 'relationshipStatus',
    'character_position': 'characterPosition'
  };
  
  return fieldMapping[field] || null;
}

/**
 * Process greeting with context integration
 */
export function processGreetingWithContext(
  character: any,
  characterName: string,
  userPersona: any,
  userProfile: any,
  initialContext: Record<string, any> | null,
  addonSettings: AddonSettings | undefined
): GreetingProcessingResult {
  const templateReplacer = createTemplateReplacer(userPersona, userProfile, characterName);
  const processedGreeting = generateGreeting(character, characterName, templateReplacer);
  const messageContext = buildMessageContext(initialContext, addonSettings);
  return {
    processedGreeting,
    messageContext
  };
}

/**
 * Enhanced greeting processing with context extraction support
 */
export function createContextTemplateReplacer(
  userPersona: any,
  userProfile: any,
  characterName: string
): TemplateReplacer {
  return createTemplateReplacer(userPersona, userProfile, characterName);
}

/**
 * Fetch user persona for greeting template replacement
 */
export async function fetchUserPersona(
  selectedPersonaId: string | null,
  userId: string,
  supabase: any
): Promise<{ name: string } | null> {
  let userPersona: { name: string } | null = null;
  if (selectedPersonaId) {
    const { data: persona } = await supabase
      .from('personas')
      .select('name')
      .eq('id', selectedPersonaId)
      .eq('user_id', userId)
      .single();
    if (persona) return persona;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_persona_id')
    .eq('id', userId)
    .single();
  if (profile?.default_persona_id) {
    const { data: defaultPersona } = await supabase
      .from('personas')
      .select('name')
      .eq('id', profile.default_persona_id)
      .eq('user_id', userId)
      .single();
    if (defaultPersona) return defaultPersona;
  }
  const { data: firstPersona } = await supabase
    .from('personas')
    .select('name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstPersona) return firstPersona;
  return null;
}

/**
 * MAIN FUNCTION: Handle complete chat creation with greeting (strict RLS path)
 */
export async function handleCreateWithGreeting(
  request: CreateWithGreetingRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any,
  req?: Request
): Promise<ChatResponse> {
  const requestId = (req?.headers.get('x-request-id') || crypto.randomUUID());
  try {
    const { charactersData, greeting, selectedPersonaId, chatMode } = request;
    if (!charactersData || charactersData.length === 0) throw new Error('No character data provided');
    const character = charactersData[0];
    const character_id = character.id;
    const character_name = character.name;

    // Profile fetch
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, default_persona_id')
      .eq('id', user.id)
      .single();

    // Persona resolution
    let effectivePersonaId: string | null = selectedPersonaId || null;
    if (effectivePersonaId) {
      const { data: owned } = await supabase
        .from('personas')
        .select('id')
        .eq('id', effectivePersonaId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!owned) {
        console.warn('createWithGreeting.persona.unownedOrMissing', { requestId, userId: user.id, attemptedPersonaId: effectivePersonaId });
        effectivePersonaId = null;
      }
    }
    if (!effectivePersonaId) {
      try { effectivePersonaId = await getBestPersonaForNewChat(user.id, character_id, supabase); } catch (e) { console.warn('createWithGreeting.getBestPersona.fail', { requestId, userId: user.id, message: (e as Error)?.message }); }
    }
    const userPersona = await fetchUserPersona(effectivePersonaId, user.id, supabase);

    // Strict two-step character fetch (no admin fallback)
    const { data: baseChar, error: baseErr } = await supabase
      .from('characters')
      .select('id,name,creator_id,visibility')
      .eq('id', character_id)
      .maybeSingle();
    if (baseErr) {
      console.error('createWithGreeting.character.fetch.base.error', { requestId, character_id, code: (baseErr as any)?.code, message: baseErr.message });
    }
    if (!baseChar) throw new Error(`Character not found: ${character_id}`);
    const allowedVis = ['public','unlisted','global'];
    const isOwner = baseChar.creator_id === user.id;
    const visibility = (baseChar as any).visibility || null;
    if (!isOwner && visibility && !allowedVis.includes(visibility)) {
      console.warn('createWithGreeting.character.visibility.block', { requestId, character_id, visibility, userId: user.id, creator_id: baseChar.creator_id });
      throw new Error('Character access denied');
    }
    const { data: defs, error: defsErr } = await supabase
      .from('character_definitions')
      .select('personality_summary,greeting,scenario,example_dialogs')
      .eq('character_id', character_id)
      .maybeSingle();
    if (defsErr) {
      console.warn('createWithGreeting.character.defs.warn', { requestId, character_id, message: defsErr.message });
    }
    const characterData = { id: baseChar.id, name: baseChar.name, creator_id: baseChar.creator_id, character_definitions: defs || {} };

    // Parse manual initial context flags
    let manualInitialEnabled = false; let manualInitialContext: any = null;
    try {
      const rawSummary = characterData?.character_definitions?.personality_summary;
      if (rawSummary) {
        const parsed = typeof rawSummary === 'string' ? JSON.parse(rawSummary) : rawSummary;
        manualInitialEnabled = !!parsed?.initial_addon_context_enabled;
        manualInitialContext = parsed?.initial_addon_context || null;
      }
    } catch {}

    const { data: userCharSettings } = await supabaseAdmin
      .from('user_character_settings')
      .select('chat_mode')
      .eq('user_id', user.id)
      .eq('character_id', character_id)
      .single();
    const effectiveChatMode: 'storytelling' | 'companion' = userCharSettings?.chat_mode || chatMode || 'storytelling';

    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        character_id: character_id,
        title: `Chat with ${character_name}`,
        selected_persona_id: effectivePersonaId,
        chat_mode: effectiveChatMode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();
    if (chatError) {
      console.error('createWithGreeting.chat.insert.error', { requestId, userId: user.id, characterId: character_id, effectivePersonaId, chatMode: effectiveChatMode, code: (chatError as any)?.code, details: (chatError as any)?.details, hint: (chatError as any)?.hint, message: chatError.message });
      const err = new Error('Failed to create chat'); (err as any).cause = chatError; throw err;
    }

    const templateReplacer = createTemplateReplacer(userPersona, profileData, character_name);
    const greetingText = greeting || generateGreeting(characterData, character_name, templateReplacer);
    let processedGreeting = greetingText;
    if (manualInitialEnabled && manualInitialContext) { try { processedGreeting = sanitizeGreetingConflicts(processedGreeting, manualInitialContext); } catch (e) { console.warn('greeting.sanitize.fail', { requestId, message: (e as Error)?.message }); } }

    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,
        content: processedGreeting,
        is_ai_message: true,
        current_context: null,
        message_order: 1,
        created_at: new Date().toISOString()
      });
    if (messageError) throw new Error('Failed to create greeting message');

    if (manualInitialEnabled && manualInitialContext && typeof manualInitialContext === 'object') {
      const cleaned = Object.fromEntries(Object.entries(manualInitialContext).filter(([_,v]) => typeof v === 'string' && v.trim()));
      if (Object.keys(cleaned).length) {
        try {
          await supabase.from('chat_context').upsert({ chat_id: chat.id, user_id: user.id, character_id: character_id, current_context: cleaned }, { onConflict: 'chat_id' });
          try {
            const supabaseUrl = (() => { try { return globalThis.Deno?.env?.get('SUPABASE_URL'); } catch { return (globalThis as any)?.process?.env?.SUPABASE_URL; } })();
            if (supabaseUrl) {
              const authHeader = req?.headers.get('authorization') || '';
              fetch(`${supabaseUrl}/functions/v1/extract-addon-context`, { method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat.id, character_id, mode: 'initial', initial_context: cleaned, addon_settings: {} }) }).catch(() => {});
            }
          } catch {}
        } catch (seedErr) { console.warn('addon.initial.seed.fail', { requestId, message: (seedErr as Error)?.message }); }
      }
    }

    try { await supabase.rpc('sync_relationship_context_for_chat', { p_user_id: user.id, p_character_id: character_id, p_chat_id: chat.id }); } catch (e) { console.warn('rel.sync.rpc.fail', { requestId, message: (e as Error)?.message }); }

    return { success: true, chat_id: chat.id, greeting: processedGreeting, greeting_used: processedGreeting, persona_id: effectivePersonaId, data: { message: 'Chat with greeting created successfully' } };
  } catch (error: any) {
    console.error('createWithGreeting.unhandled', { requestId, message: error?.message, cause: (error?.cause && (error.cause as any)?.message) || null });
    return { success: false, error: error.message };
  }
}

/**
 * Prepare character data for context extraction
 */
export function prepareCharacterForContext(character: any): any {
  return {
    personality_summary: character.character_definitions?.personality_summary || '',
    description: character.character_definitions?.description || '',
    scenario: character.character_definitions?.scenario || '',
    greeting: character.character_definitions?.greeting || ''
  };
}

// Helper: sanitize greeting by stripping conflicting clothing/location sentences when canonical initial context present
function sanitizeGreetingConflicts(greeting: string, initialCtx: any | null): string {
  if (!initialCtx || !greeting || typeof greeting !== 'string') return greeting;
  const clothing = typeof initialCtx.clothing === 'string' ? initialCtx.clothing.trim().toLowerCase() : '';
  const location = typeof initialCtx.location === 'string' ? initialCtx.location.trim().toLowerCase() : '';
  if (!clothing && !location) return greeting;
  const sentences = greeting.split(/(?<=[.!?])\s+/).filter(s => s.trim().length);
  const clothingPatterns = /(\bwearing\b|\bdressed\b|\bclad in\b|\boutfit\b|\buniform\b|\bgarb\b|\battire\b|\bcoat\b|\bdress\b|\bshirt\b|\bskirt\b|\bjeans\b|\bhar[dm]or\b)/i;
  const locationPatterns = /(\bat the\b|\bin the\b|\bat a\b|\bin a\b|\bhere in\b|\binside the\b|\bwithin the\b)/i;
  const cleaned: string[] = [];
  for (const sent of sentences) {
    const lower = sent.toLowerCase();
    let drop = false;
    if (clothing && clothingPatterns.test(lower) && !lower.includes(clothing)) {
      drop = true;
    }
    if (location && locationPatterns.test(lower) && !lower.includes(location)) {
      // If sentence mentions a location but not the canonical one, drop it
      drop = true;
    }
    if (!drop) cleaned.push(sent);
  }
  // If everything got stripped, fall back to original greeting to avoid empty first message
  if (cleaned.length === 0) return greeting;
  const result = cleaned.join(' ');
  // Avoid overly short / degenerate output
  if (result.trim().length < 8) return greeting;
  return result;
}
