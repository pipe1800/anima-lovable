                                    import { supabase } from '@/integrations/supabase/client'
import type { Profile, Character, Plan, Subscription, Credits, Chat, Message, OnboardingChecklistItem, UserOnboardingProgress } from '@/types/database'

// =============================================================================
// SEARCH INTERFACES
// =============================================================================

export interface SearchParams {
  searchQuery?: string;
  sortBy: string;
  filters: {
    tags?: string[];
    creator?: string;
    nsfw?: boolean;
    gender?: string;
  };
  limit: number;
  offset: number;
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  error?: any;
}

// =============================================================================
// MONETIZATION QUERIES - Plans, Models, Credit Packs
// =============================================================================

/**
 * Get all active subscription plans
 */
export const getActivePlans = async () => {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  return { data, error }
}

/**
 * Get all active AI models
 */
export const getActiveModels = async () => {
  const { data, error } = await supabase
    .from('models')
    .select(`
      *,
      min_plan:plans(name, price_monthly)
    `)
    .eq('is_active', true)
    .order('credit_multiplier', { ascending: true })

  return { data, error }
}

/**
 * Get all active credit packs
 */
export const getActiveCreditPacks = async () => {
  const { data, error } = await supabase
    .from('credit_packs')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true })

  return { data, error }
}

/**
 * Get user's current active subscription
 */
export const getUserActiveSubscription = async (userId: string) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      plan:plans(*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return { data, error }
}

// =============================================================================
// PROFILE QUERIES - Safe public/private data handling
// =============================================================================

/**
 * Get public profile data (safe for displaying to other users)
 * NEVER use SELECT * on profiles in public contexts!
 */
export const getPublicProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, banner_url, bio, created_at, timezone')
    .eq('id', userId)
    .maybeSingle()

  return { data, error }
}

/**
 * Get complete profile data (only for the current user's own profile)
 */
export const getPrivateProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  return { data, error }
}

/**
 * Update user's own profile
 */
export const updateProfile = async (userId: string, updates: Partial<Profile>) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, username, avatar_url, banner_url, bio, created_at, timezone')
    .maybeSingle()

  return { data, error }
}

// =============================================================================
// CHARACTER QUERIES
// =============================================================================

/**
 * Get public characters (for discovery page) with enhanced data
 */
export const getPublicCharacters = async (limit = 20, offset = 0, nsfwEnabled = true) => {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      avatar_url,
      interaction_count,
      created_at,
      creator_id
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error || !data) {
    return { data: [], error }
  }

  let filteredData = data;

  // Apply NSFW filtering based on tags
  if (nsfwEnabled === false) {
    // User has NSFW disabled - exclude characters with NSFW tag
    const { data: nsfwCharacters } = await supabase
      .from('character_tags')
      .select('character_id')
      .eq('tag_id', 24); // NSFW tag ID

    if (nsfwCharacters && nsfwCharacters.length > 0) {
      const nsfwCharacterIds = new Set(nsfwCharacters.map(c => c.character_id));
      filteredData = filteredData.filter(char => !nsfwCharacterIds.has(char.id));
    }
  }

  // Fetch creator profiles, counts, and tags separately for each character
  const charactersWithCreators = await Promise.all(
    filteredData.map(async (character) => {
      // Get creator profile
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', character.creator_id)
        .maybeSingle()

      // Get actual chat count
      const { count: chatCount } = await supabase
        .from('chats')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id)

      // Get likes count
      const { count: likesCount } = await supabase
        .from('character_likes')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id)

      // Get favorites count
      const { count: favoritesCount } = await supabase
        .from('character_favorites')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id)

      // Get character tags
      const { data: tagsData } = await supabase
        .from('character_tags')
        .select(`
          tag:tags(id, name)
        `)
        .eq('character_id', character.id)

      return {
        ...character,
        creator: creatorData,
        actual_chat_count: chatCount || 0,
        likes_count: likesCount || 0,
        favorites_count: favoritesCount || 0,
        tags: tagsData?.map(t => t.tag) || []
      }
    })
  )

  return { data: charactersWithCreators, error: null }
}

/**
 * Enhanced character search with server-side filtering and pagination
 */
export const searchPublicCharacters = async (params: SearchParams): Promise<SearchResult<any>> => {
  const { searchQuery, sortBy, filters, limit, offset } = params;

  // Build the base query
  let query = supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      avatar_url,
      interaction_count,
      created_at,
      creator_id
    `, { count: 'exact' })
    .eq('visibility', 'public');

  // Apply text search if provided
  if (searchQuery && searchQuery.trim()) {
    query = query.or(`name.ilike.%${searchQuery}%,short_description.ilike.%${searchQuery}%`);
  }

  // Don't apply NSFW filter in the query - we'll handle it after fetching

  // Apply creator filter if specified
  if (filters.creator && filters.creator.trim()) {
    // First get creator IDs that match the username
    const { data: creators } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', `%${filters.creator}%`);
    
    if (creators && creators.length > 0) {
      const creatorIds = creators.map(c => c.id);
      query = query.in('creator_id', creatorIds);
    } else {
      // No matching creators found, return empty result
      return { data: [], total: 0, hasMore: false };
    }
  }

  // Apply sorting
  switch (sortBy) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'conversations':
    case 'popular':
    default:
      query = query.order('interaction_count', { ascending: false });
      break;
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error || !data) {
    return { data: [], total: 0, hasMore: false, error };
  }

  let filteredData = data;

  // Apply NSFW filtering based on tags
  if (filters.nsfw === false) {
    // User has NSFW disabled - exclude characters with NSFW tag
    // First get all character IDs that have the NSFW tag
    const { data: nsfwCharacters } = await supabase
      .from('character_tags')
      .select('character_id')
      .eq('tag_id', 24); // NSFW tag ID

    if (nsfwCharacters && nsfwCharacters.length > 0) {
      const nsfwCharacterIds = new Set(nsfwCharacters.map(c => c.character_id));
      filteredData = filteredData.filter(char => !nsfwCharacterIds.has(char.id));
    }
  }
  // If NSFW is true, show all content (no filtering needed)

  // If we have tag filters, we need to filter by tags
  if (filters.tags && filters.tags.length > 0) {
    // Get characters that have at least one of the specified tags
    const { data: characterTags } = await supabase
      .from('character_tags')
      .select(`
        character_id,
        tag:tags(name)
      `)
      .in('character_id', filteredData.map(c => c.id));

    const charactersWithTags = new Set<string>();
    characterTags?.forEach(ct => {
      if (ct.tag && filters.tags!.includes(ct.tag.name)) {
        charactersWithTags.add(ct.character_id);
      }
    });

    filteredData = filteredData.filter(c => charactersWithTags.has(c.id));
  }

  // Fetch additional data for filtered characters
  const charactersWithDetails = await Promise.all(
    filteredData.map(async (character) => {
      // Get creator profile
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', character.creator_id)
        .maybeSingle();

      // Get actual chat count
      const { count: chatCount } = await supabase
        .from('chats')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id);

      // Get likes count
      const { count: likesCount } = await supabase
        .from('character_likes')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id);

      // Get favorites count
      const { count: favoritesCount } = await supabase
        .from('character_favorites')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id);

      // Get character tags
      const { data: tagsData } = await supabase
        .from('character_tags')
        .select(`
          tag:tags(id, name)
        `)
        .eq('character_id', character.id);

      return {
        ...character,
        creator: creatorData,
        actual_chat_count: chatCount || 0,
        likes_count: likesCount || 0,
        favorites_count: favoritesCount || 0,
        tags: tagsData?.map(t => t.tag).filter(Boolean) || []
      };
    })
  );

  // Apply conversations sorting if specified (now that we have chat counts)
  if (sortBy === 'conversations') {
    charactersWithDetails.sort((a, b) => b.actual_chat_count - a.actual_chat_count);
  }

  const total = count || 0;
  const hasMore = offset + limit < total;

  return {
    data: charactersWithDetails,
    total,
    hasMore
  };
}

/**
 * Get user's own characters (all visibility levels)
 */
export const getUserCharacters = async (userId: string) => {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      avatar_url,
      visibility,
      interaction_count,
      created_at,
      updated_at,
      character_definitions!inner(
        personality_summary,
        scenario
      )
    `)
    .eq('creator_id', userId)
    .order('updated_at', { ascending: false })

  if (error || !data) {
    return { data: data || [], error }
  }

  // Get actual chat counts and likes for each character
  const charactersWithCounts = await Promise.all(
    data.map(async (character) => {
      // Get actual chat count
      const { count: chatCount } = await supabase
        .from('chats')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id)

      // Get likes count
      const { count: likesCount } = await supabase
        .from('character_likes')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id)

      return {
        ...character,
        actual_chat_count: chatCount || 0,
        likes_count: likesCount || 0,
        tagline: (() => {
          try {
            const personalitySummary = JSON.parse(character.character_definitions?.personality_summary || '{}');
            return personalitySummary.title || (character.character_definitions?.scenario as any)?.title || character.short_description || '';
          } catch {
            return (character.character_definitions?.scenario as any)?.title || character.short_description || '';
          }
        })()
      }
    })
  )

  return { data: charactersWithCounts, error: null }
}

/**
 * Get character with full details (respects visibility rules)
 */
export const getCharacterDetails = async (characterId: string) => {

  const { data, error } = await supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      avatar_url,
      visibility,
      interaction_count,
      created_at,
      creator_id
    `)
    .eq('id', characterId)
    .maybeSingle()


  if (error || !data) {
    console.error('❌ Failed to fetch character:', error)
    return { data: null, error }
  }

  // Fetch creator profile separately
  const { data: creatorData, error: creatorError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', data.creator_id)
    .maybeSingle()

  console.log('👤 Creator query result:', { creatorData, creatorError })

  // Fetch character definition separately
  const { data: definitionData, error: definitionError } = await supabase
    .from('character_definitions')
    .select('greeting, description, personality_summary, scenario')
    .eq('character_id', characterId)
    .maybeSingle()

  console.log('📄 Definition query result:', { definitionData, definitionError })

  // Fetch character tags separately
  const { data: tagsData, error: tagsError } = await supabase
    .from('character_tags')
    .select(`
      tag:tags(id, name)
    `)
    .eq('character_id', characterId)

  console.log('🏷️ Tags query result:', { tagsData, tagsError })

  // Combine the data
  const characterWithDetails = {
    ...data,
    creator: creatorData,
    character_definitions: definitionData,
    definition: definitionData ? [definitionData] : [],
    tags: tagsData?.map(t => t.tag).filter(Boolean) || []
  }


  return { data: characterWithDetails, error: null }
}

/**
 * Create a new character
 */
export const createCharacter = async (characterData: {
  name: string
  short_description?: string
  avatar_url?: string
  visibility?: 'public' | 'unlisted' | 'private'
  definition: string
  greeting?: string
  long_description?: string
}) => {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not authenticated')

  // Create character
  const { data: character, error: characterError } = await supabase
    .from('characters')
    .insert({
      creator_id: user.user.id,
      name: characterData.name,
      short_description: characterData.short_description,
      avatar_url: characterData.avatar_url,
      visibility: characterData.visibility || 'private'
    })
    .select()
    .single()

  if (characterError || !character) return { data: null, error: characterError }

  // Create character definition
  const { error: definitionError } = await supabase
    .from('character_definitions')
    .insert({
      character_id: character.id,
      personality_summary: characterData.definition,
      greeting: characterData.greeting,
      description: characterData.long_description
    })

  if (definitionError) {
    // Cleanup: delete the character if definition creation failed
    await supabase.from('characters').delete().eq('id', character.id)
    return { data: null, error: definitionError }
  }

  return { data: character, error: null }
}

// =============================================================================
// BILLING QUERIES
// =============================================================================

/**
 * Get available subscription plans
 */
export const getSubscriptionPlans = async () => {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  return { data: data || [], error }
}

/**
 * Get user's current subscription
 */
export const getUserSubscription = async (userId: string) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      plan:plans(*)
    `)
    .eq('user_id', userId)
    .maybeSingle()

  return { data, error }
}

/**
 * Get user's credit balance
 */
export const getUserCredits = async (userId: string) => {
  const { data, error } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()

  return { data, error }
}

// =============================================================================
// ONBOARDING QUERIES
// =============================================================================

/**
 * Get onboarding checklist items
 */
export const getOnboardingChecklist = async () => {
  const { data, error } = await supabase
    .from('onboarding_checklist_items')
    .select('*')
    .order('id', { ascending: true })

  return { data: data || [], error }
}

/**
 * Get user's onboarding progress
 */
export const getUserOnboardingProgress = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_onboarding_progress')
    .select(`
      *,
      task:onboarding_checklist_items(*)
    `)
    .eq('user_id', userId)

  return { data: data || [], error }
}

/**
 * Mark onboarding task as completed
 */
export const completeOnboardingTask = async (userId: string, taskId: number) => {
  const { data, error } = await supabase
    .from('user_onboarding_progress')
    .upsert({
      user_id: userId,
      task_id: taskId,
      completed_at: new Date().toISOString()
    })
    .select()

  return { data, error }
}

// =============================================================================
// CHAT QUERIES
// =============================================================================

/**
 * Get user's chat sessions with pagination
 */
export const getUserChatsPaginated = async (
  userId: string, 
  page: number = 1, 
  pageSize: number = 10
) => {
  const offset = (page - 1) * pageSize;
  
  // First get total count for pagination
  const { count: totalCount } = await supabase
    .from('chats')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Then get paginated data
  const { data, error } = await supabase
    .from('chats')
    .select(`
      id,
      title,
      last_message_at,
      created_at,
      character_id,
      character:characters(
        id, 
        name, 
        avatar_url,
        short_description,
        character_definitions!inner(
          personality_summary,
          scenario
        )
      )
    `)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error || !data) {
    return { data: [], totalCount: 0, error };
  }

  // Fetch last message and user character settings for each chat
  const chatsWithLastMessage = await Promise.all(
    data.map(async (chat) => {
      // Fetch message count for this chat
      const { count: messageCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chat.id);

      const { data: messages } = await supabase
        .from('messages')
        .select('content, is_ai_message')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastMessage = messages?.[0];

      // Fetch user character settings
      const { data: userSettings } = await supabase
        .from('user_character_settings')
        .select('chat_mode, time_awareness_enabled')
        .eq('user_id', userId)
        .eq('character_id', chat.character_id)
        .maybeSingle();

      return {
        ...chat,
        message_count: messageCount || 0, // Add message count here
        character: {
          ...chat.character,
          tagline: (() => {
            try {
              const personalitySummary = JSON.parse(chat.character?.character_definitions?.personality_summary || '{}');
              return personalitySummary.title || (chat.character?.character_definitions?.scenario as any)?.title || chat.character?.short_description || '';
            } catch {
              return (chat.character?.character_definitions?.scenario as any)?.title || chat.character?.short_description || '';
            }
          })()
        },
        messages: lastMessage ? [lastMessage] : [],
        userSettings: userSettings || { chat_mode: 'storytelling', time_awareness_enabled: false }
      };
    })
  );

  return { 
    data: chatsWithLastMessage, 
    totalCount: totalCount || 0,
    currentPage: page,
    totalPages: Math.ceil((totalCount || 0) / pageSize),
    error: null 
  };
};

/**
 * Get user's chat sessions with last message preview (legacy - keep for compatibility)
 */
export const getUserChats = async (userId: string) => {
  const { data, error } = await supabase
    .from('chats')
    .select(`
      id,
      title,
      last_message_at,
      created_at,
      character_id,
      character:characters(
        id, 
        name, 
        avatar_url,
        short_description,
        character_definitions!inner(
          personality_summary,
          scenario
        )
      )
    `)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error || !data) {
    return { data: data || [], error }
  }

  // Fetch last message and user character settings for each chat
  const chatsWithLastMessage = await Promise.all(
    data.map(async (chat) => {
      const { data: lastMessage } = await supabase
        .from('messages')
        .select('content, is_ai_message')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Fetch user character settings
      const { data: userSettings } = await supabase
        .from('user_character_settings')
        .select('chat_mode, time_awareness_enabled')
        .eq('user_id', userId)
        .eq('character_id', chat.character_id)
        .maybeSingle()

      return {
        ...chat,
        character: {
          ...chat.character,
          tagline: (() => {
            try {
              const personalitySummary = JSON.parse(chat.character?.character_definitions?.personality_summary || '{}');
              return personalitySummary.title || (chat.character?.character_definitions?.scenario as any)?.title || chat.character?.short_description || '';
            } catch {
              return (chat.character?.character_definitions?.scenario as any)?.title || chat.character?.short_description || '';
            }
          })()
        },
        lastMessage: lastMessage?.content || null,
        lastMessageIsAI: lastMessage?.is_ai_message || false,
        userSettings: userSettings || { chat_mode: 'storytelling', time_awareness_enabled: false }
      }
    })
  )

  return { data: chatsWithLastMessage, error: null }
}

/**
 * Get messages for a chat with pagination
 */
export const getChatMessages = async (chatId: string, limit = 50, offset = 0) => {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      content,
      is_ai_message,
      created_at,
      author_id,
      message_order
    `)
    .eq('chat_id', chatId)
    .order('message_order', { ascending: false }) // Get newest messages first by message order
    .range(offset, offset + limit - 1)

  // Reverse to show oldest first in UI
  return { data: data ? data.reverse() : [], error }
}

/**
 * Get recent messages for a chat (for quick loading)
 * Context is now stored in messages.current_context by Edge Function
 */
export const getRecentChatMessages = async (chatId: string, limit = 20) => {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      content,
      is_ai_message,
      created_at,
      author_id,
      current_context,
      message_order
    `)
    .eq('chat_id', chatId)
    .order('message_order', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error };
  
  const messages = data.reverse();
  
  // Context is now stored in messages.current_context - old tables removed
  const messageIds = messages.map(msg => msg.id);
  const contextData = []; // Empty since tables were removed
  
  // Current context also moved to new system
  const currentContextData = []; // Empty since table was removed
  
  // Build current context state for inheritance
  const currentContext = {};
  currentContextData?.forEach(ctx => {
    const contextField = ctx.context_type === 'mood' ? 'moodTracking' :
                        ctx.context_type === 'clothing' ? 'clothingInventory' :
                        ctx.context_type === 'location' ? 'locationTracking' :
                        ctx.context_type === 'time_weather' ? 'timeAndWeather' :
                        ctx.context_type === 'relationship' ? 'relationshipStatus' : null;
    if (contextField) {
      currentContext[contextField] = ctx.current_context;
    }
  });
  
  // Create a map of message ID to context updates - preserve ALL historical context
  const contextUpdatesMap = new Map();
  contextData?.forEach(ctx => {
    contextUpdatesMap.set(ctx.message_id, ctx.context_updates);
  });
  
  // Attach context to messages - ALL historical context is preserved
  const messagesWithContext = messages.map(msg => ({
    ...msg,
    message_context: contextUpdatesMap.has(msg.id) ? [{ context_updates: contextUpdatesMap.get(msg.id) }] : [],
    current_context: msg.current_context || currentContext // Use message-specific context if available, otherwise use chat context
  }));
  
  return { data: messagesWithContext, error: null };
}

/**
 * Get earlier messages for infinite scroll
 * This function ALWAYS preserves historical context data regardless of current addon settings
 */
export const getEarlierChatMessages = async (chatId: string, beforeMessageOrder: number, limit = 20) => {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      content,
      is_ai_message,
      created_at,
      author_id,
      current_context,
      message_order
    `)
    .eq('chat_id', chatId)
    .lt('message_order', beforeMessageOrder)
    .order('message_order', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error };
  
  const messages = data.reverse();
  
  // Context is now stored in messages.current_context - old tables removed
  const messageIds = messages.map(msg => msg.id);
  const contextData = []; // Empty since tables were removed
  
  // Current context also moved to new system
  const currentContextData = []; // Empty since table was removed
  
  // Build current context state for inheritance
  const currentContext = {};
  currentContextData?.forEach(ctx => {
    const contextField = ctx.context_type === 'mood' ? 'moodTracking' :
                        ctx.context_type === 'clothing' ? 'clothingInventory' :
                        ctx.context_type === 'location' ? 'locationTracking' :
                        ctx.context_type === 'time_weather' ? 'timeAndWeather' :
                        ctx.context_type === 'relationship' ? 'relationshipStatus' : null;
    if (contextField) {
      currentContext[contextField] = ctx.current_context;
    }
  });
  
  // Create a map of message ID to context updates - preserve ALL historical context
  const contextUpdatesMap = new Map();
  contextData?.forEach(ctx => {
    contextUpdatesMap.set(ctx.message_id, ctx.context_updates);
  });
  
  // Attach context to messages - ALL historical context is preserved
  const messagesWithContext = messages.map(msg => ({
    ...msg,
    message_context: contextUpdatesMap.has(msg.id) ? [{ context_updates: contextUpdatesMap.get(msg.id) }] : [],
    current_context: msg.current_context || currentContext // Use message-specific context if available, otherwise use chat context
  }));
  
  return { data: messagesWithContext, error: null };
}

// NOTE: Message creation is now handled by the unified chat-management edge function
// Direct database message creation has been replaced with proper edge function calls

/**
 * Consume credits for a user
 */
export async function consumeCredits(userId: string, credits: number): Promise<{ data: boolean | null, error: any }> {
  const { data, error } = await supabase
    .rpc('consume_credits', { 
      user_id_param: userId,
      credits_to_consume: credits 
    })

  return { data, error }
}

/**
 * Get monthly credit usage for a user
 */
export async function getMonthlyCreditsUsage(userId: string): Promise<{ data: { used: number } | null, error: any }> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  
  const { data, error } = await supabase
    .from('messages')
    .select('token_cost')
    .eq('author_id', userId)
    .eq('is_ai_message', true)
    .gte('created_at', startOfMonth.toISOString())

  if (error) return { data: null, error }
  
  const totalUsed = data?.reduce((sum, message) => sum + (message.token_cost || 1), 0) || 0
  
  return { data: { used: totalUsed }, error: null }
}

// =============================================================================
// WORLD INFO QUERIES
// =============================================================================

/**
 * Get public world infos (for discovery page)
 */
export const getPublicWorldInfos = async (limit = 20, offset = 0) => {
  const { data, error } = await supabase
    .from('world_infos')
    .select(`
      id,
      name,
      short_description,
      interaction_count,
      created_at,
      creator_id
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error || !data) {
    return { data: [], error }
  }

  // Fetch creator profiles and counts separately for each world info
  const worldInfosWithCreators = await Promise.all(
    data.map(async (worldInfo) => {
      // Get creator profile
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', worldInfo.creator_id)
        .maybeSingle()

      // Get likes count
      const { count: likesCount } = await supabase
        .from('world_info_likes')
        .select('id', { count: 'exact' })
        .eq('world_info_id', worldInfo.id)

      // Get favorites count
      const { count: favoritesCount } = await supabase
        .from('world_info_favorites')
        .select('id', { count: 'exact' })
        .eq('world_info_id', worldInfo.id)

      // Get usage count (how many users are using this world info)
      const { count: usageCount } = await supabase
        .from('world_info_users')
        .select('id', { count: 'exact' })
        .eq('world_info_id', worldInfo.id)

      return {
        ...worldInfo,
        creator: creatorData,
        likes_count: likesCount || 0,
        favorites_count: favoritesCount || 0,
        usage_count: usageCount || 0
      }
    })
  )

  return { data: worldInfosWithCreators, error: null }
}

/**
 * Enhanced world info search with server-side filtering and pagination
 */
export const searchPublicWorldInfos = async (params: SearchParams): Promise<SearchResult<any>> => {
  const { searchQuery, sortBy, filters, limit, offset } = params;

  // Build the base query
  let query = supabase
    .from('world_infos')
    .select(`
      id,
      name,
      short_description,
      interaction_count,
      created_at,
      creator_id
    `, { count: 'exact' })
    .eq('visibility', 'public');

  // Apply text search if provided
  if (searchQuery && searchQuery.trim()) {
    query = query.or(`name.ilike.%${searchQuery}%,short_description.ilike.%${searchQuery}%`);
  }

  // Apply creator filter if specified
  if (filters.creator && filters.creator.trim()) {
    // First get creator IDs that match the username
    const { data: creators } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', `%${filters.creator}%`);
    
    if (creators && creators.length > 0) {
      const creatorIds = creators.map(c => c.id);
      query = query.in('creator_id', creatorIds);
    } else {
      // No matching creators found, return empty result
      return { data: [], total: 0, hasMore: false };
    }
  }

  // Apply sorting
  switch (sortBy) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'conversations':
    case 'popular':
    default:
      query = query.order('interaction_count', { ascending: false });
      break;
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error || !data) {
    return { data: [], total: 0, hasMore: false, error };
  }

  let filteredData = data;

  // Apply NSFW filtering based on tags
  if (filters.nsfw === false) {
    // User has NSFW disabled - exclude world infos with NSFW tag
    const { data: nsfwWorldInfos } = await supabase
      .from('world_info_tags')
      .select('world_info_id')
      .eq('tag_id', 24); // NSFW tag ID

    if (nsfwWorldInfos && nsfwWorldInfos.length > 0) {
      const nsfwWorldInfoIds = new Set(nsfwWorldInfos.map(w => w.world_info_id));
      filteredData = filteredData.filter(worldInfo => !nsfwWorldInfoIds.has(worldInfo.id));
    }
  }
  // If NSFW is true, show all content (no filtering needed)

  // If we have tag filters, we need to filter by tags
  if (filters.tags && filters.tags.length > 0) {
    // Get world infos that have at least one of the specified tags
    const { data: worldInfoTags } = await supabase
      .from('world_info_tags')
      .select(`
        world_info_id,
        tag:tags(name)
      `)
      .in('world_info_id', filteredData.map(w => w.id));

    const worldInfosWithTags = new Set<string>();
    worldInfoTags?.forEach(wt => {
      if (wt.tag && filters.tags!.includes(wt.tag.name)) {
        worldInfosWithTags.add(wt.world_info_id);
      }
    });

    filteredData = filteredData.filter(w => worldInfosWithTags.has(w.id));
  }

  // Fetch additional data for filtered world infos
  const worldInfosWithDetails = await Promise.all(
    filteredData.map(async (worldInfo) => {
      // Get creator profile
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', worldInfo.creator_id)
        .maybeSingle();

      // Get likes count
      const { count: likesCount } = await supabase
        .from('world_info_likes')
        .select('id', { count: 'exact' })
        .eq('world_info_id', worldInfo.id);

      // Get favorites count
      const { count: favoritesCount } = await supabase
        .from('world_info_favorites')
        .select('id', { count: 'exact' })
        .eq('world_info_id', worldInfo.id);

      // Get usage count (how many users are using this world info)
      const { count: usageCount } = await supabase
        .from('world_info_users')
        .select('id', { count: 'exact' })
        .eq('world_info_id', worldInfo.id);

      // Get world info tags
      const { data: tagsData } = await supabase
        .from('world_info_tags')
        .select(`
          tag:tags(id, name)
        `)
        .eq('world_info_id', worldInfo.id);

      return {
        ...worldInfo,
        creator: creatorData,
        likes_count: likesCount || 0,
        favorites_count: favoritesCount || 0,
        usage_count: usageCount || 0,
        tags: tagsData?.map(t => t.tag).filter(Boolean) || []
      };
    })
  );

  // Apply conversations/usage sorting if specified (now that we have usage counts)
  if (sortBy === 'conversations') {
    worldInfosWithDetails.sort((a, b) => b.usage_count - a.usage_count);
  }

  const total = count || 0;
  const hasMore = offset + limit < total;

  return {
    data: worldInfosWithDetails,
    total,
    hasMore
  };
}

// =============================================================================
// CHARACTER FAVORITES QUERIES
// =============================================================================

/**
 * Toggle character favorite
 */
export const toggleCharacterFavorite = async (userId: string, characterId: string) => {
  // Check if already favorited
  const { data: existing } = await supabase
    .from('character_favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle()

  if (existing) {
    // Remove favorite
    const { error } = await supabase
      .from('character_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('character_id', characterId)
    
    return { data: { favorited: false }, error }
  } else {
    // Add favorite
    const { error } = await supabase
      .from('character_favorites')
      .insert({ user_id: userId, character_id: characterId })
    
    return { data: { favorited: true }, error }
  }
}

/**
 * Check if character is favorited by user
 */
export const isCharacterFavorited = async (userId: string, characterId: string) => {
  const { data, error } = await supabase
    .from('character_favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle()

  return { data: !!data, error }
}

/**
 * Get recommended characters based on tags and popularity
 */
export const getRecommendedCharacters = async (tags: string[], limit = 4) => {
  try {
    let charactersQuery = supabase
      .from('characters')
      .select(`
        id,
        name,
        short_description,
        avatar_url,
        interaction_count,
        created_at,
        character_definitions!inner(greeting)
      `)
      .eq('visibility', 'public')

    // If we have tags, try to filter by them first
    if (tags.length > 0) {
      const { data: tagIds } = await supabase
        .from('tags')
        .select('id')
        .in('name', tags)

      if (tagIds && tagIds.length > 0) {
        const { data: characterIds } = await supabase
          .from('character_tags')
          .select('character_id')
          .in('tag_id', tagIds.map(tag => tag.id))

        if (characterIds && characterIds.length > 0) {
          charactersQuery = charactersQuery.in('id', characterIds.map(ct => ct.character_id))
        }
      }
    }

    const { data: characters, error } = await charactersQuery
      .order('interaction_count', { ascending: false })
      .limit(limit)

    if (error) throw error

    // If we don't have enough characters from tags, fallback to most popular
    if (!characters || characters.length < limit) {
      const { data: popularCharacters, error: popularError } = await supabase
        .from('characters')
        .select(`
          id,
          name,
          short_description,
          avatar_url,
          interaction_count,
          created_at,
          character_definitions!inner(greeting)
        `)
        .eq('visibility', 'public')
        .order('interaction_count', { ascending: false })
        .limit(limit)

      if (popularError) throw popularError
      
      // Combine and deduplicate
      const allCharacters = characters || []
      const existingIds = new Set(allCharacters.map(c => c.id))
      
      popularCharacters?.forEach(char => {
        if (!existingIds.has(char.id) && allCharacters.length < limit) {
          allCharacters.push(char)
        }
      })

      // Get likes count for all characters
      const charactersWithCounts = await Promise.all(
        allCharacters.map(async (character) => {
          const { count: likesCount } = await supabase
            .from('character_likes')
            .select('id', { count: 'exact' })
            .eq('character_id', character.id)

          return {
            ...character,
            likes_count: likesCount || 0
          }
        })
      )

      return { data: charactersWithCounts.slice(0, limit), error: null }
    }

    // Get likes count for tag-filtered characters
    const charactersWithCounts = await Promise.all(
      characters.map(async (character) => {
        const { count: likesCount } = await supabase
          .from('character_likes')
          .select('id', { count: 'exact' })
          .eq('character_id', character.id)

        return {
          ...character,
          likes_count: likesCount || 0
        }
      })
    )

    return { data: charactersWithCounts, error: null }
  } catch (error) {
    console.error('Error getting recommended characters:', error)
    return { data: [], error }
  }
}

/**
 * Get user's favorite characters
 */

/**
 * Get user's favorite characters
 */
export const getUserFavorites = async (userId: string) => {
  console.log('Fetching favorites for user:', userId);
  
  const { data, error } = await supabase
    .from('character_favorites')
    .select(`
      id,
      created_at,
      character:characters(
        id,
        name,
        short_description,
        avatar_url,
        interaction_count,
        created_at,
        creator_id,
        character_definitions!inner(
          personality_summary,
          scenario
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  console.log('Favorites query result:', { data, error });

  if (error) {
    console.error('Error fetching favorites:', error);
    return { data: [], error };
  }

  // Filter out any null characters and map to character data
  const characters = data?.map(fav => fav.character).filter(Boolean) || [];
  
  // Get creator info, actual chat counts and likes for each character
  const charactersWithDetails = await Promise.all(
    characters.map(async (character) => {
      // Get creator profile
      console.log('Fetching creator profile for creator_id:', character.creator_id);
      const { data: creatorData, error: creatorError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', character.creator_id)
        .maybeSingle()
      
      console.log('Creator profile result:', { creatorData, creatorError });

      // Get actual chat count
      const { count: chatCount } = await supabase
        .from('chats')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id)

      // Get likes count
      const { count: likesCount } = await supabase
        .from('character_likes')
        .select('id', { count: 'exact' })
        .eq('character_id', character.id)

      return {
        ...character,
        creator: creatorData,
        actual_chat_count: chatCount || 0,
        likes_count: likesCount || 0,
        tagline: (() => {
          // First try to get title from personality_summary JSON
          const personalitySummary = character.character_definitions?.personality_summary;
          if (personalitySummary && typeof personalitySummary === 'object') {
            const parsedPersonality = personalitySummary as any;
            if (parsedPersonality.title) {
              return parsedPersonality.title;
            }
          }
          
          // Then try personality_summary as string (JSON)
          if (personalitySummary && typeof personalitySummary === 'string') {
            try {
              const parsed = JSON.parse(personalitySummary);
              if (parsed.title) {
                return parsed.title;
              }
            } catch (e) {
              // Not valid JSON, ignore
            }
          }
          
          // Then try scenario title
          const scenario = character.character_definitions?.scenario;
          if (scenario && typeof scenario === 'object') {
            const parsedScenario = scenario as any;
            if (parsedScenario.title) {
              return parsedScenario.title;
            }
          }
          
          // Finally fallback to short_description
          return character.short_description || '';
        })()
      }
    })
  )

  console.log('Processed favorite characters:', charactersWithDetails);
  
  return { data: charactersWithDetails, error: null };
}

// =============================================================================
// CHAT DELETION QUERIES
// =============================================================================

/**
 * Delete a chat and all its related data safely
 */
export const deleteChat = async (chatId: string, userId: string) => {
  try {
    console.log(`Starting deleteChat for chat ${chatId} by user ${userId}`);
    
    // Use the database function that properly handles all foreign key constraints
    // Based on the schema review, this function deletes in the correct order:
    // 1. character_memories (references chat_id)
    // 2. chat_context (references chat_id with UNIQUE constraint) 
    // 3. messages (references chat_id)
    // 4. chats (main table)
    const { data, error } = await (supabase as any)
      .rpc('delete_chat_complete', {
        p_chat_id: chatId,
        p_user_id: userId
      });

    if (error) {
      console.error(`Failed to delete chat ${chatId}:`, error);
    } else {
      console.log(`Successfully deleted chat ${chatId}`);
    }

    return { data, error };
  } catch (err) {
    console.error('Error in deleteChat:', err);
    return { data: null, error: err };
  }
}

/**
 * Delete multiple chats in batch with proper error handling
 */
export const deleteMultipleChats = async (chatIds: string[], userId: string) => {
  console.log(`Starting deletion of ${chatIds.length} chats:`, chatIds);
  const results = [];
  
  // Process deletions in smaller batches to avoid overwhelming the database
  const batchSize = 3; // Process 3 at a time
  
  for (let i = 0; i < chatIds.length; i += batchSize) {
    const batch = chatIds.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}:`, batch);
    
    // Process current batch in parallel
    const batchPromises = batch.map(async (chatId) => {
      try {
        console.log(`Deleting chat ${chatId}...`);
        const result = await deleteChat(chatId, userId);
        if (result.error) {
          console.error(`Failed to delete chat ${chatId}:`, result.error);
        } else {
          console.log(`Successfully deleted chat ${chatId}`);
        }
        return result;
      } catch (error) {
        console.error(`Error deleting chat ${chatId}:`, error);
        return { data: null, error };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to prevent rate limiting
    if (i + batchSize < chatIds.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  console.log(`Deletion complete: ${successCount} successful, ${errorCount} failed`);
  
  return results;
}

/**
 * Delete ALL chats for a user (DEV ONLY - DANGEROUS!)
 */
export const deleteAllUserChats = async (userId: string) => {
  console.log(`⚠️ DELETING ALL CHATS for user ${userId}`);
  
  try {
    // Get all chat IDs for the user
    const { data: allChats, error: fetchError } = await supabase
      .from('chats')
      .select('id')
      .eq('user_id', userId);
    
    if (fetchError) {
      console.error('Error fetching chats:', fetchError);
      return { success: false, error: fetchError, deletedCount: 0 };
    }
    
    if (!allChats || allChats.length === 0) {
      console.log('No chats to delete');
      return { success: true, error: null, deletedCount: 0 };
    }
    
    const chatIds = allChats.map(chat => chat.id);
    console.log(`Found ${chatIds.length} chats to delete`);
    
    // Delete them using the existing batch delete function
    const results = await deleteMultipleChats(chatIds, userId);
    
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    
    console.log(`✅ Deleted ${successCount} chats, ❌ Failed: ${errorCount}`);
    
    return { 
      success: errorCount === 0, 
      error: errorCount > 0 ? `Failed to delete ${errorCount} chats` : null,
      deletedCount: successCount 
    };
  } catch (err) {
    console.error('Error in deleteAllUserChats:', err);
    return { success: false, error: err, deletedCount: 0 };
  }
}

// =============================================================================
// PERSONA QUERIES
// =============================================================================

/**
 * Get user's personas (only for own profile)
 */
export const getUserPersonasForProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return { data: data || [], error }
}
