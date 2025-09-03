import { supabase } from '@/db/client';
import { ChatContextMaintenance } from '@/data';
import { callEdgeFunction } from '@/data/edge/core/client';
import type { TrackedContext } from '@/types/chat';
import logger from '@/utils/logger';

interface AddonSettings {
  moodTracking?: boolean;
  clothingInventory?: boolean;
  locationTracking?: boolean;
  timeAndWeather?: boolean;
  relationshipStatus?: boolean;
  characterPosition?: boolean;
  enchantmentStatus?: boolean; // ensure completeness
  itemInventory?: boolean; // ensure completeness
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

// Helper to merge a partial update with last known context (kept on window for optimistic merges)
function mergeWithPrev(partial: Partial<TrackedContext>): TrackedContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prev: TrackedContext | undefined = (window as any).__latestTrackedContext;
  return {
    moodTracking: prev?.moodTracking || 'No context',
    clothingInventory: prev?.clothingInventory || 'No context',
    locationTracking: prev?.locationTracking || 'No context',
    timeAndWeather: prev?.timeAndWeather || 'No context',
    relationshipStatus: prev?.relationshipStatus || 'No context',
    characterPosition: prev?.characterPosition || 'No context',
    enchantmentStatus: prev?.enchantmentStatus || 'No context',
    itemInventory: prev?.itemInventory || 'No context',
    ...partial
  };
}

async function dispatchFreshContextUpdate(chatId: string) {
  try {
  const { data, error } = await ChatContextMaintenance.refetchContextCurrent(chatId);
    if (error) {
      logger.warn('⚠️ Failed to refetch chat_context after extraction', error);
      return;
    }
    if (data?.current_context) {
      const raw = data.current_context as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const converted: TrackedContext = {
        moodTracking: raw?.mood || 'No context',
        clothingInventory: raw?.clothing || 'No context',
        locationTracking: raw?.location || 'No context',
        timeAndWeather: raw?.time_weather || 'No context',
        relationshipStatus: raw?.relationship || 'No context',
        characterPosition: raw?.character_position || 'No context',
        enchantmentStatus: raw?.enchantment_status || 'No context',
        itemInventory: raw?.item_inventory || 'No context'
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__latestTrackedContext = converted;
      window.dispatchEvent(new CustomEvent('addon-context-updated', { detail: { chatId, context: converted, ts: Date.now(), optimistic: false } }));
      logger.debug('📡 Dispatched addon-context-updated (authoritative)');
    }
  } catch (e) {
    logger.warn('⚠️ dispatchFreshContextUpdate error', e);
  }
}

// Extract keys present only (avoid wiping unrelated fields when function omits some)
function buildPartialTrackedContext(summary: any): Partial<TrackedContext> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const partial: Partial<TrackedContext> = {};
  if ('mood' in summary) partial.moodTracking = summary.mood || 'No context';
  if ('clothing' in summary) partial.clothingInventory = summary.clothing || 'No context';
  if ('location' in summary) partial.locationTracking = summary.location || 'No context';
  if ('time_weather' in summary) partial.timeAndWeather = summary.time_weather || 'No context';
  if ('relationship' in summary) partial.relationshipStatus = summary.relationship || 'No context';
  if ('character_position' in summary) partial.characterPosition = summary.character_position || 'No context';
  if ('enchantment_status' in summary) partial.enchantmentStatus = summary.enchantment_status || 'No context';
  if ('item_inventory' in summary) partial.itemInventory = summary.item_inventory || 'No context';
  return partial;
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
    logger.info('🔄 Calling extract-addon-context function...');
    
    // Call the extract-addon-context edge function
    const { ok, data, error } = await callEdgeFunction<any>('extract-addon-context', { // eslint-disable-line @typescript-eslint/no-explicit-any
      chat_id: chatId,
      character_id: characterId,
      message_id: messageId,
      user_message: userMessage,
      ai_response: aiResponse,
      addon_settings: addonSettings
    });

    if (error || !ok) {
      logger.error('❌ Context extraction error:', error);
      return null;
    }

    const response = data as ContextExtractionResponse;
    
    if (!response.success) {
      logger.error('❌ Context extraction failed:', response.error || response.message);
      return null;
    }

    logger.info('✅ Context extracted successfully:', response.context_summary);

    if (response.context_summary) {
      const partial = buildPartialTrackedContext(response.context_summary);
      const trackedContext = mergeWithPrev(partial);

      await updateMessageWithContext(messageId, trackedContext);

      // Optimistic UI update
      window.dispatchEvent(new CustomEvent('addon-context-updated', { detail: { chatId, context: trackedContext, ts: Date.now(), optimistic: true } }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__latestTrackedContext = trackedContext;
      logger.debug('⚡ addon-context-updated (optimistic) dispatched');

      // Follow-up authoritative refresh
      dispatchFreshContextUpdate(chatId);

      return trackedContext;
    }

    return null;
  } catch (error) {
    logger.error('❌ Context extraction error:', error);
    return null;
  }
}

/**
 * Updates a message with extracted context
 */
async function updateMessageWithContext(messageId: string, context: TrackedContext): Promise<void> {
  try {
    logger.info('💾 Updating message with context:', messageId);
    
  const { error } = await ChatContextMaintenance.updateMessageCurrentContext(messageId, context as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (error) {
      logger.error('❌ Failed to update message with context:', error);
    } else {
      logger.info('✅ Message updated with context successfully');
    }
  } catch (error) {
    logger.error('❌ Error updating message with context:', error);
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
    logger.info('⏭️ Initial addon context extraction disabled (deferred until first user → AI exchange).');
    return null; // Always defer now
  } catch (error) {
    logger.error('❌ Initial context extraction error:', error);
    return null;
  }
}

/**
 * Extracts context for a message
 */
export async function extractContext(params: ExtractContextParams) {
  try {
    logger.info('🔄 Calling extract-addon-context function...');
    
    const { ok, data, error } = await callEdgeFunction<any>('extract-addon-context', { // eslint-disable-line @typescript-eslint/no-explicit-any
      chat_id: params.chatId,
      character_id: params.characterId,
      message_id: params.messageId,
      user_message: params.userMessage,
      ai_response: params.aiResponse,
      addon_settings: params.addonSettings
    });

    if (error || !ok) {
      logger.error('❌ Context extraction error:', error);
      return null;
    }

    const response = data as ContextExtractionResponse;
    
    if (!response.success) {
      logger.error('❌ Context extraction failed:', response.error || response.message);
      return null;
    }

    logger.info('✅ Context extracted successfully:', response.context_summary);

    if (response.context_summary) {
      const partial = buildPartialTrackedContext(response.context_summary);
      const trackedContext = mergeWithPrev(partial);

      await updateMessageWithContext(params.messageId, trackedContext);

      window.dispatchEvent(new CustomEvent('addon-context-updated', { detail: { chatId: params.chatId, context: trackedContext, ts: Date.now(), optimistic: true } }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__latestTrackedContext = trackedContext;
      logger.debug('⚡ addon-context-updated (optimistic) dispatched');

      dispatchFreshContextUpdate(params.chatId);

      return trackedContext;
    }

    return null;
  } catch (error) {
    logger.error('❌ Context extraction error:', error);
    return null;
  }
}
