import { supabase } from '@/integrations/supabase/client';
import type { TrackedContext } from '@/types/chat';

interface AddonSettings {
  moodTracking?: boolean;
  clothingInventory?: boolean;
  locationTracking?: boolean;
  timeAndWeather?: boolean;
  relationshipStatus?: boolean;
  characterPosition?: boolean;
}

interface ExtractContextParams {
  chatId: string;
  characterId: string;
  messageId: string;
  userMessage: string;
  aiResponse: string;
  addonSettings: AddonSettings;
}

interface ContextExtractionResponse {
  success: boolean;
  context_summary?: any;
  message?: string;
  error?: string;
}

/**
 * Calls the extract-addon-context edge function to extract context from conversation
 * and updates the message with the extracted context
 */
export async function extractAndUpdateContext({
  chatId,
  characterId,
  messageId,
  userMessage,
  aiResponse,
  addonSettings
}: ExtractContextParams): Promise<TrackedContext | null> {
  try {
    console.log('🔄 Calling extract-addon-context function...');
    
    // Call the extract-addon-context edge function
    const { data, error } = await supabase.functions.invoke('extract-addon-context', {
      body: {
        chat_id: chatId,
        character_id: characterId,
        message_id: messageId,
        user_message: userMessage,
        ai_response: aiResponse,
        addon_settings: addonSettings
      }
    });

    if (error) {
      console.error('❌ Context extraction error:', error);
      return null;
    }

    const response = data as ContextExtractionResponse;
    
    if (!response.success) {
      console.error('❌ Context extraction failed:', response.error || response.message);
      return null;
    }

    console.log('✅ Context extracted successfully:', response.context_summary);

    // Convert the extracted context to TrackedContext format
    if (response.context_summary) {
      const trackedContext: TrackedContext = {
        moodTracking: response.context_summary.mood || 'No context',
        clothingInventory: response.context_summary.clothing || 'No context',
        locationTracking: response.context_summary.location || 'No context',
        timeAndWeather: response.context_summary.time_weather || 'No context',
        relationshipStatus: response.context_summary.relationship || 'No context',
        characterPosition: response.context_summary.character_position || 'No context'
      };

      // Update the message with the extracted context
      await updateMessageWithContext(messageId, trackedContext);

      return trackedContext;
    }

    return null;
  } catch (error) {
    console.error('❌ Context extraction error:', error);
    return null;
  }
}

/**
 * Updates a message with extracted context
 */
async function updateMessageWithContext(messageId: string, context: TrackedContext): Promise<void> {
  try {
    console.log('💾 Updating message with context:', messageId);
    
    const { error } = await supabase
      .from('messages')
      .update({ current_context: context as any })
      .eq('id', messageId);

    if (error) {
      console.error('❌ Failed to update message with context:', error);
    } else {
      console.log('✅ Message updated with context successfully');
    }
  } catch (error) {
    console.error('❌ Error updating message with context:', error);
  }
}

/**
 * Extracts context for initial character greeting
 */
export async function extractInitialContext(
  chatId: string,
  characterId: string,
  addonSettings: AddonSettings
): Promise<TrackedContext | null> {
  try {
    console.log('🔄 Extracting initial context for character greeting...');
    
    const { data, error } = await supabase.functions.invoke('extract-addon-context', {
      body: {
        chat_id: chatId,
        character_id: characterId,
        addon_settings: addonSettings
      }
    });

    if (error) {
      console.error('❌ Initial context extraction error:', error);
      return null;
    }

    const response = data as ContextExtractionResponse;
    
    if (!response.success || !response.context_summary) {
      console.log('⏭️ No initial context extracted');
      return null;
    }

    // Convert to TrackedContext format
    const trackedContext: TrackedContext = {
      moodTracking: response.context_summary.mood || 'No context',
      clothingInventory: response.context_summary.clothing || 'No context',
      locationTracking: response.context_summary.location || 'No context',
      timeAndWeather: response.context_summary.time_weather || 'No context',
      relationshipStatus: response.context_summary.relationship || 'No context',
      characterPosition: response.context_summary.character_position || 'No context'
    };

    console.log('✅ Initial context extracted:', trackedContext);
    return trackedContext;
  } catch (error) {
    console.error('❌ Initial context extraction error:', error);
    return null;
  }
}
