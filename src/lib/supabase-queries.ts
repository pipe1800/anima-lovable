import { supabase } from '@/integrations/supabase/client'
import type { Profile, Character, Plan, Subscription, Credits, Chat, Message, OnboardingChecklistItem, UserOnboardingProgress } from '@/types/database'

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
    .select('id, username, avatar_url, bio, created_at')
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
    .select('id, username, avatar_url, bio, created_at')
    .maybeSingle()

  return { data, error }
}

// =============================================================================
// CHARACTER QUERIES
// =============================================================================

/**
 * Get public characters (for discovery page) with enhanced data
 */
export const getPublicCharacters = async (limit = 20, offset = 0) => {
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

  // Fetch creator profiles, counts, and tags separately for each character
  const charactersWithCreators = await Promise.all(
    data.map(async (character) => {
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
      updated_at
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
        likes_count: likesCount || 0
      }
    })
  )

  return { data: charactersWithCounts, error: null }
}

/**
 * Get character with full details (respects visibility rules)
 */
export const getCharacterDetails = async (characterId: string) => {
  console.log('🔍 getCharacterDetails called with characterId:', characterId)

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

  console.log('📊 Character query result:', { data, error })

  if (error || !data) {
    console.error('❌ Failed to fetch character:', error)
    return { data: null, error }
  }

  // Fetch creator profile separately
  console.log('🔍 Fetching creator profile for userId:', data.creator_id)
  const { data: creatorData, error: creatorError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', data.creator_id)
    .maybeSingle()

  console.log('👤 Creator query result:', { creatorData, creatorError })

  // Fetch character definition separately
  console.log('🔍 Fetching character definition for characterId:', characterId)
  const { data: definitionData, error: definitionError } = await supabase
    .from('character_definitions')
    .select('greeting, description, personality_summary, scenario')
    .eq('character_id', characterId)
    .maybeSingle()

  console.log('📄 Definition query result:', { definitionData, definitionError })

  // Fetch character tags separately
  console.log('🔍 Fetching character tags for characterId:', characterId)
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
    tags: tagsData || []
  }

  console.log('✅ Final character with details:', characterWithDetails)

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
 * Get user's chat sessions with last message preview
 */
export const getUserChats = async (userId: string) => {
  const { data, error } = await supabase
    .from('chats')
    .select(`
      id,
      title,
      last_message_at,
      created_at,
      character:characters(id, name, avatar_url)
    `)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })

  if (error || !data) {
    return { data: data || [], error }
  }

  // Fetch last message for each chat
  const chatsWithLastMessage = await Promise.all(
    data.map(async (chat) => {
      const { data: lastMessage } = await supabase
        .from('messages')
        .select('content, is_ai_message')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return {
        ...chat,
        lastMessage: lastMessage?.content || null,
        lastMessageIsAI: lastMessage?.is_ai_message || false
      }
    })
  )

  return { data: chatsWithLastMessage, error: null }
}

/**
 * Create a new chat session
 */
export const createChat = async (userId: string, characterId: string, title?: string) => {
  const { data, error } = await supabase
    .from('chats')
    .insert({
      user_id: userId,
      character_id: characterId,
      title: title
    })
    .select()
    .single()

  return { data, error }
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
      author_id
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false }) // Get newest messages first
    .range(offset, offset + limit - 1)

  // Reverse to show oldest first in UI
  return { data: data ? data.reverse() : [], error }
}

/**
 * Get recent messages for a chat (for quick loading)
 * This function ALWAYS preserves historical context data regardless of current addon settings
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
      current_context
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error };
  
  const messages = data.reverse();
  
  // Fetch ALL context updates for these messages - NEVER filter based on current addon settings
  // Historical context must be preserved regardless of current settings
  const messageIds = messages.map(msg => msg.id);
  const { data: contextData } = await supabase
    .from('message_context')
    .select('message_id, context_updates')
    .in('message_id', messageIds);
  
  // Fetch current context state for the chat (only for inheritance, not filtering)
  const { data: currentContextData } = await supabase
    .from('user_chat_context')
    .select('context_type, current_context')
    .eq('chat_id', chatId)
    .neq('current_context', 'No context');
  
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
export const getEarlierChatMessages = async (chatId: string, beforeTimestamp: string, limit = 20) => {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      content,
      is_ai_message,
      created_at,
      author_id,
      current_context
    `)
    .eq('chat_id', chatId)
    .lt('created_at', beforeTimestamp)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error };
  
  const messages = data.reverse();
  
  // Fetch ALL context updates for these messages - NEVER filter based on current addon settings
  // Historical context must be preserved regardless of current settings
  const messageIds = messages.map(msg => msg.id);
  const { data: contextData } = await supabase
    .from('message_context')
    .select('message_id, context_updates')
    .in('message_id', messageIds);
  
  // Fetch current context state for the chat (only for inheritance, not filtering)
  const { data: currentContextData } = await supabase
    .from('user_chat_context')
    .select('context_type, current_context')
    .eq('chat_id', chatId)
    .neq('current_context', 'No context');
  
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
 * Create a new message in a chat
 */
export const createMessage = async (chatId: string, authorId: string, content: string, isAiMessage: boolean = false) => {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      author_id: authorId,
      content: content,
      is_ai_message: isAiMessage
    })
    .select()
    .single()

  // Update the chat's last_message_at timestamp
  if (!error && data) {
    await supabase
      .from('chats')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', chatId)
  }

  return { data, error }
}

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
        creator_id
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
        likes_count: likesCount || 0
      }
    })
  )

  console.log('Processed favorite characters:', charactersWithDetails);
  
  return { data: charactersWithDetails, error: null };
}
