import type { CreateBasicChatRequest, ChatResponse } from '../types/index.ts';
import { getBestPersonaForNewChat } from './database.ts';
import { mapGlobalSettingsToAddonSettings, sanitizeAddonSettings, anyAddonEnabled } from '../../_shared/settings-mapper.ts';

interface BasicChatHandlerOptions {
  req?: Request; // to forward auth header for initial context extraction
  supabaseAdmin?: any; // needed to fetch global settings
}

export async function handleCreateBasicChat(
  request: CreateBasicChatRequest,
  user: any,
  supabase: any,
  options?: BasicChatHandlerOptions
): Promise<ChatResponse> {
  try {
    const { charactersData, selectedPersonaId } = request;
    
    if (!charactersData || charactersData.length === 0) {
      throw new Error('No character data provided');
    }

    const character = charactersData[0];
    const character_id = character.id;
    const character_name = character.name;

    console.log('Creating basic chat for user:', user.id, 'character:', character_id, 'persona:', selectedPersonaId);

    // If no persona ID provided, get the best persona for this user/character combo
    const effectivePersonaId = selectedPersonaId || await getBestPersonaForNewChat(user.id, character_id, supabase);
    console.log('Effective persona ID:', effectivePersonaId);

    // Fast operations only - parallel where possible
    const [userProfileResult, characterDetailsResult, selectedPersonaResult] = await Promise.allSettled([
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      supabase.from('characters').select(`
        *,
        character_definitions (*)
      `).eq('id', character_id).single(),
      // Fetch the effective persona (last used or first created)
      effectivePersonaId ? 
        supabase.from('personas').select('name, bio, lore').eq('id', effectivePersonaId).eq('user_id', user.id).single() :
        Promise.resolve({ status: 'fulfilled', value: { data: null } })
    ]);

    // Extract results
    const userProfile = userProfileResult.status === 'fulfilled' ? userProfileResult.value.data : null;
    let characterDetails = characterDetailsResult.status === 'fulfilled' ? characterDetailsResult.value.data : null;
    const selectedPersona = selectedPersonaResult.status === 'fulfilled' ? selectedPersonaResult.value.data : null;

    // Attempt to parse manual initial addon context
    let manualInitialEnabled = false; let manualInitialContext: any = null;
    try {
      const rawSummary = characterDetails?.character_definitions?.personality_summary;
      if (rawSummary) {
        const parsed = typeof rawSummary === 'string' ? JSON.parse(rawSummary) : rawSummary;
        manualInitialEnabled = !!parsed?.initial_addon_context_enabled;
        manualInitialContext = parsed?.initial_addon_context || null;
      }
    } catch {}

    // Fallback: Try character_definitions if not found in characters
    if (!characterDetails) {
      console.log('Character not found in characters table, trying character_definitions...');
      const { data: def, error: defError } = await supabase
        .from('character_definitions')
        .select('*')
        .eq('character_id', character_id)
        .single();
      
      if (def) {
        characterDetails = {
          id: character_id,
          name: def.name || character_name,
          character_definitions: def,
        };
        console.log('✅ Fallback: Found character in character_definitions only');
      } else {
        console.error('Character not found in either table');
        throw new Error('Character not found');
      }
    }

    // Create the chat record
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        character_id: character_id,
        title: `Chat with ${character_name}`,
        selected_persona_id: effectivePersonaId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (chatError) {
      console.error('Error creating chat:', chatError);
      throw new Error('Failed to create chat');
    }

    console.log('Chat created:', chat.id);

    // Seed manual initial addon context if applicable
    if (manualInitialEnabled && manualInitialContext && typeof manualInitialContext === 'object') {
      const cleaned = Object.fromEntries(Object.entries(manualInitialContext).filter(([_,v]) => typeof v === 'string' && v.trim()));
      if (Object.keys(cleaned).length) {
        try {
          await supabase.from('chat_context').upsert({
            chat_id: chat.id,
            user_id: user.id,
            character_id: character_id,
            current_context: cleaned
          }, { onConflict: 'chat_id' });
        } catch (seedErr) {
          console.log('⚠️ Failed to seed manual initial addon context (basic path)', seedErr);
        }
      }
    }

    // Template replacement function
    const replaceTemplates = (content: string): string => {
      if (!content) return content;
      
      const userName = selectedPersona?.name || userProfile?.username || 'User';
      const charName = character_name || 'Character';
      
      return content
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{char\}\}/g, charName);
    };

    // Helper reused from greeting processor for sanitation (lightweight duplication to avoid cross-import complexity)
    function sanitizeGreetingConflictsBasic(greeting: string, initialCtx: any | null): string {
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
        if (clothing && clothingPatterns.test(lower) && !lower.includes(clothing)) drop = true;
        if (location && locationPatterns.test(lower) && !lower.includes(location)) drop = true;
        if (!drop) cleaned.push(sent);
      }
      if (cleaned.length === 0) return greeting; // avoid empty
      const result = cleaned.join(' ');
      return result.trim().length < 8 ? greeting : result;
    }

    // Get raw greeting and apply template replacement
    const rawGreeting = characterDetails.character_definitions?.greeting || 
      `Hello! I'm ${character_name}. It's great to meet you. What would you like to talk about?`;
    const processedGreeting = manualInitialEnabled ? sanitizeGreetingConflictsBasic(replaceTemplates(rawGreeting), manualInitialContext) : replaceTemplates(rawGreeting);
    
    console.log('✅ Processed greeting:', processedGreeting);

    // Save the greeting message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        chat_id: chat.id,
        author_id: null,  // AI messages should have NULL author_id
        content: processedGreeting,
        is_ai_message: true,
        current_context: null,  // No context yet - will be added later
        message_order: 1,
        created_at: new Date().toISOString()
      });

    if (messageError) {
      console.error('Error creating greeting message:', messageError);
      throw new Error('Failed to create greeting message');
    }

    console.log('✅ Basic chat created successfully:', chat.id);

  // Initial addon context extraction removed (deferred until first user → AI exchange)

    return {
      success: true,
      chat_id: chat.id,
      data: {
        message: 'Basic chat created successfully',
        needs_context_extraction: false
      }
    };

  } catch (error) {
    console.error('Error in handleCreateBasicChat:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
