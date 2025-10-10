/**
 * Greeting Enhancement Module
 * 
 * Handles greeting message generation and enhancement with context
 */ /**
 * Generate enhanced greeting with context
 */ export function generateEnhancedGreeting(character, persona, profile, initialContext, templateReplacer) {
  if (initialContext) {
    // Get the character's original greeting and process it
    const rawGreeting = character.character_definitions?.greeting || `Hello! I'm ${character.name}. It's great to meet you. What would you like to talk about?`;
    return templateReplacer(rawGreeting);
  }
  // Fallback greeting without context
  const userName = persona?.name || profile?.username || 'there';
  return `Hello ${userName}! I'm ${character.name}. What would you like to talk about?`;
}
/**
 * Build message context object from extracted context
 */ export function buildMessageContext(initialContext, addonSettings) {
  const messageContext = {};
  if (!initialContext || !addonSettings) {
    return messageContext;
  }
  // Map extracted context fields to message context keys
  Object.entries(initialContext).forEach(([field, value])=>{
    if (value && value !== 'No context') {
      const contextKey = field === 'mood' ? 'moodTracking' : field === 'clothing' ? 'clothingInventory' : field === 'location' ? 'locationTracking' : field === 'time_weather' ? 'timeAndWeather' : field === 'relationship' ? 'relationshipStatus' : field === 'character_position' ? 'characterPosition' : null;
      if (contextKey && addonSettings[contextKey]) {
        messageContext[contextKey] = value;
      }
    }
  });
  return messageContext;
}
/**
 * Update message with enhanced greeting and context
 */ export async function updateMessageWithGreeting(supabase, chatId, greeting, messageContext) {
  try {
    const { error: updateError } = await supabase.from('messages').update({
      content: greeting,
      current_context: Object.keys(messageContext).length > 0 ? messageContext : null,
      updated_at: new Date().toISOString()
    }).eq('chat_id', chatId).eq('message_order', 1).eq('is_ai_message', true);
    if (updateError) {
      console.error('❌ Error updating message with context:', updateError);
      throw new Error('Failed to update message with context');
    }
    console.log('✅ Message updated with enhanced greeting and context');
  } catch (error) {
    console.error('❌ Message update failed:', error);
    // Re-throw for proper error handling
    throw error;
  }
}
/**
 * Update chat metadata
 */ export async function updateChatMetadata(supabase, chatId) {
  try {
    // Attempt update including context_extracted; if column missing, retry without it.
    const base = {
      updated_at: new Date().toISOString(),
      context_extracted: true
    };
    const { error: chatUpdateError } = await supabase.from('chats').update(base).eq('id', chatId);
    if (chatUpdateError && /context_extracted/i.test(chatUpdateError.message || '')) {
      console.warn('⚠️ context_extracted column missing; retrying without it');
      const { error: retryError } = await supabase.from('chats').update({
        updated_at: new Date().toISOString()
      }).eq('id', chatId);
      if (retryError) {
        console.error('❌ Chat metadata retry failed:', retryError);
        return; // do not throw; non-fatal
      }
      console.log('✅ Chat metadata updated (without context_extracted column)');
      return;
    }
    if (chatUpdateError) {
      console.error('❌ Error updating chat metadata:', chatUpdateError);
      return; // non-fatal skip
    }
    console.log('✅ Chat metadata updated successfully');
  } catch (error) {
    console.error('❌ Chat metadata update failed (unexpected):', error);
  }
}
