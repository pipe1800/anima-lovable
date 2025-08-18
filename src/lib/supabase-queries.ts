import { supabase } from '@/integrations/supabase/client'
import type { Profile, Character, Plan, Subscription, Credits, Chat, Message, OnboardingChecklistItem, UserOnboardingProgress } from '@/types/database'
import { getUserPersonas } from '@/lib/persona-operations'

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

// Generic in-flight deduper for singleton or high-frequency queries
const fetchOnceMap = new Map<string, Promise<any>>();
const fetchOnce = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (fetchOnceMap.has(key)) return fetchOnceMap.get(key)! as Promise<T>;
  const p = fn().finally(() => { fetchOnceMap.delete(key); });
  fetchOnceMap.set(key, p);
  return p;
};

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
  return fetchOnce(`active-subscription:${userId}`, async () => {
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
  })
}

// =============================================================================
// PROFILE QUERIES - Safe public/private data handling
// =============================================================================

/**
 * Get public profile data (safe for displaying to other users)
 * NEVER use SELECT * on profiles in public contexts!
 */
export const getPublicProfile = async (userId: string) => {
  return fetchOnce(`public-profile:${userId}`, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, banner_url, bio, created_at, timezone')
      .eq('id', userId)
      .maybeSingle()

    return { data, error }
  })
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
 * In-flight dedupe for public characters queries (now backed by character_profile_view)
 */
const inFlightPublicCharacters = new Map<string, Promise<any>>();

// Helper to map rows from character_profile_view adding creator profile in batch
async function hydrateCharacterProfiles(rows: any[]) {
  if (!rows.length) return [];
  const creatorIds = [...new Set(rows.map(r => r.creator_id))];
  const { data: creators } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', creatorIds);
  const creatorsMap = new Map((creators || []).map(c => [c.id, c]));
  return rows.map(r => ({
    ...r,
    creator: creatorsMap.get(r.creator_id) || null,
    tags: (r.tags || []).map((t: any) => t),
  }));
}

export const getPublicCharacters = async (limit = 20, offset = 0, nsfwEnabled = true) => {
  const key = JSON.stringify({ limit, offset, nsfwEnabled });
  if (inFlightPublicCharacters.has(key)) return inFlightPublicCharacters.get(key)!;
  const p = (async () => {
    const { data, error } = await supabase
      .from('character_profile_view')
      .select('*')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error || !data) return { data: [], error };
    let rows: any[] = data as any[]; // cast to any for computed view columns
    if (!nsfwEnabled) rows = rows.filter(r => !r.is_nsfw);
    const hydrated = await hydrateCharacterProfiles(rows);
    return { data: hydrated, error: null };
  })();
  inFlightPublicCharacters.set(key, p);
  try { return await p; } finally { inFlightPublicCharacters.delete(key); }
};

/**
 * In-flight dedupe map for search queries (character search via view)
 */
const inFlightSearchPublicCharacters = new Map<string, Promise<SearchResult<any>>>();

export const searchPublicCharacters = async (params: SearchParams): Promise<SearchResult<any>> => {
  const key = JSON.stringify(params);
  if (inFlightSearchPublicCharacters.has(key)) return inFlightSearchPublicCharacters.get(key)!;
  const prom = (async () => {
    const { searchQuery, sortBy, filters, limit, offset } = params;
    let query = supabase
      .from('character_profile_view')
      .select('*', { count: 'exact' })
      .eq('visibility', 'public');

    if (searchQuery && searchQuery.trim()) {
      // Use ilike on name/short_description (definition fields optional)
      query = query.or(`name.ilike.%${searchQuery}%,short_description.ilike.%${searchQuery}%`);
    }

    // Creator username filter (needs lookup)
    if (filters.creator && filters.creator.trim()) {
      const { data: creators } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', `%${filters.creator}%`);
      if (!creators?.length) return { data: [], total: 0, hasMore: false };
      query = query.in('creator_id', creators.map(c => c.id));
    }

    // Sorting
    switch (sortBy) {
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'conversations':
        query = query.order('chats_count', { ascending: false });
        break;
      case 'popular':
      default:
        query = query.order('interaction_count', { ascending: false });
        break;
    }

    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error || !data) return { data: [], total: 0, hasMore: false, error };
    let rows: any[] = data as any[]; // cast to any for view-specific fields
    if (filters.nsfw === false) rows = rows.filter(r => !r.is_nsfw);
    if (filters.tags && filters.tags.length) {
      rows = rows.filter(r => (r.tag_names || []).some((t: string) => filters.tags!.includes(t)));
    }
    const hydrated = await hydrateCharacterProfiles(rows);

    // Post-sort override (if needed for conversations which is already sorted by chats_count server-side)
    if (sortBy === 'conversations') {
      hydrated.sort((a, b) => (b.chats_count || 0) - (a.chats_count || 0));
    }

    const total = count || 0;
    const hasMore = offset + limit < total;
    return { data: hydrated, total, hasMore };
  })();
  inFlightSearchPublicCharacters.set(key, prom);
  try { return await prom; } finally { inFlightSearchPublicCharacters.delete(key); }
};

/**
 * Get user's own characters (all visibility levels)
 */
export const getUserCharacters = async (userId: string) => {
  return fetchOnce(`user-characters:${userId}`, async () => {
    const { data, error } = await supabase
      .from('characters')
      .select(`id, name, short_description, avatar_url, visibility, interaction_count, chats_count, likes_count, created_at, updated_at`)
      .eq('creator_id', userId)
      .order('updated_at', { ascending: false });
    return { data: data || [], error };
  });
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
      tagline,
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

// Helper: fetch sticky publish flag without strict typing constraints
export const getCharacterWasPublic = async (characterId: string): Promise<boolean> => {
  try {
    const { data } = await (supabase as any)
      .from('characters')
      .select('was_public')
      .eq('id', characterId)
      .maybeSingle();
    return !!data?.was_public;
  } catch {
    return false;
  }
};

/**
 * Create a new character
 */
export const createCharacter = async (userId: string, characterData: {
  name: string
  short_description?: string
  avatar_url?: string
  visibility?: 'public' | 'unlisted' | 'private'
  definition: string
  greeting?: string
  long_description?: string
}) => {
  if (!userId) throw new Error('Not authenticated');
  const { data: character, error: characterError } = await supabase
    .from('characters')
    .insert({
      creator_id: userId,
      name: characterData.name,
      short_description: characterData.short_description,
      avatar_url: characterData.avatar_url,
      visibility: characterData.visibility || 'private'
    })
    .select()
    .single();
  if (characterError || !character) return { data: null, error: characterError };
  const { error: definitionError } = await supabase
    .from('character_definitions')
    .insert({
      character_id: character.id,
      personality_summary: characterData.definition,
      greeting: characterData.greeting,
      long_description: characterData.long_description || ''
    });
  if (definitionError) return { data: null, error: definitionError };
  return { data: character, error: null };
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
  // Deprecated: use getUserChatsBatched + client-side slice/pagination if needed.
  // Keep returning structure to avoid runtime errors while migrating.
  const batched = await getUserChatsBatched(userId);
  const start = (page - 1) * pageSize;
  const slice = batched.data.slice(start, start + pageSize);
  return {
    data: slice,
    totalCount: batched.data.length,
    currentPage: page,
    totalPages: Math.ceil(batched.data.length / pageSize),
    error: batched.error || null
  };
};

/**
 * Removed legacy getUserChats (replaced by getUserChatsBatched)
 */
let inFlightUserChats = new Map<string, Promise<{ data: any[]; error: any }>>();
export const getUserChatsBatched = async (userId: string) => {
  if (inFlightUserChats.has(userId)) return inFlightUserChats.get(userId)!;
  const prom = (async () => {
    const { data, error } = await supabase.rpc('get_user_chats_batched', { p_user_id: userId });
    if (error) return { data: [], error };
    const mapped = (data || []).map((row: any) => ({
      id: row.chat_id,
      title: row.title,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
      character_id: row.character_id,
      character: {
        id: row.character_id,
        name: row.character_name,
        avatar_url: row.character_avatar_url,
        short_description: row.character_short_description,
        tagline: row.character_short_description || ''
      },
      lastMessage: row.last_message,
      lastMessageIsAI: row.last_message_is_ai,
      message_count: row.message_count,
      userSettings: {
        chat_mode: row.chat_mode || 'storytelling',
        time_awareness_enabled: row.time_awareness_enabled || false
      }
    }));
    return { data: mapped, error: null };
  })();
  inFlightUserChats.set(userId, prom);
  try { return await prom; } finally { inFlightUserChats.delete(userId); }
};

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
 * DEPRECATED: getPublicWorldInfos replaced by world info snapshot RPC
 */
export const getPublicWorldInfos = async (limit = 20, offset = 0) => {
  const { getWorldInfoSnapshot } = await import('@/lib/snapshots');
  const snap = await getWorldInfoSnapshot(null, limit, offset);
  return { data: snap?.public || [], error: null };
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
        .from('world_info_user_likes')
        .select('*', { count: 'exact' })
        .eq('world_info_id', worldInfo.id);

      // Get favorites count
      const { count: favoritesCount } = await (supabase as any)
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
 * Get user's favorite characters (public ones), ordered by most recently favorited
 */
export const getUserFavorites = async (userId: string) => {
  // Fetch favorite character IDs
  const { data: favorites, error } = await supabase
    .from('character_favorites')
    .select('character_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error };

  const ids = (favorites || []).map((f) => f.character_id).filter(Boolean);
  if (ids.length === 0) return { data: [], error: null };

  // Fetch character data from the flattened view
  const { data: rows, error: viewError } = await supabase
    .from('character_profile_view')
    .select('*')
    .in('id', ids)
    .eq('visibility', 'public');

  if (viewError || !rows) return { data: [], error: viewError };

  // Preserve the favorite order
  const orderMap = new Map(ids.map((id, idx) => [id, idx]));
  const sorted = [...rows].sort(
    (a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
  );

  // Return as-is (view already provides creator, tags, and counters)
  return { data: sorted, error: null };
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
      .eq('visibility', 'public');

    if (tags.length > 0) {
      const { data: tagIds } = await supabase
        .from('tags')
        .select('id')
        .in('name', tags);
      if (tagIds && tagIds.length > 0) {
        const { data: characterIds } = await supabase
          .from('character_tags')
          .select('character_id')
          .in('tag_id', tagIds.map(tag => tag.id));
        if (characterIds && characterIds.length > 0) {
          charactersQuery = charactersQuery.in('id', characterIds.map(ct => ct.character_id));
        }
      }
    }

    const { data: characters, error } = await charactersQuery
      .order('interaction_count', { ascending: false })
      .limit(limit);
    if (error) throw error;

    let finalCharacters = characters || [];

    if (!finalCharacters || finalCharacters.length < limit) {
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
        .limit(limit);
      if (popularError) throw popularError;
      const existingIds = new Set(finalCharacters.map(c => c.id));
      popularCharacters?.forEach(char => {
        if (!existingIds.has(char.id) && finalCharacters.length < limit) {
          finalCharacters.push(char);
        }
      });
    }

    if (finalCharacters.length === 0) return { data: [], error: null };

    // Batch likes counts
    const { data: likesRows } = await supabase
      .from('character_likes')
      .select('character_id, id')
      .in('character_id', finalCharacters.map(c => c.id));
    const likeCounts = new Map<string, number>();
    (likesRows||[]).forEach(r => likeCounts.set(r.character_id, (likeCounts.get(r.character_id)||0)+1));
    const charactersWithCounts = finalCharacters.map(c => ({
      ...c,
      likes_count: likeCounts.get(c.id) || 0,
    }));

    return { data: charactersWithCounts.slice(0, limit), error: null };
  } catch (error) {
    console.error('Error getting recommended characters:', error)
    return { data: [], error }
  }
};

// =============================================================================
// CHAT DELETION QUERIES
// =============================================================================

/**
 * Delete a chat and all its related data safely
 */
export const deleteChat = async (chatId: string, userId: string) => {
  try {
    const { data, error } = await (supabase as any).rpc('delete_chat_complete', {
      p_chat_id: chatId,
      p_user_id: userId,
    });
    return { data, error };
  } catch (err) {
    console.error('Error in deleteChat:', err);
    return { data: null, error: err };
  }
};

/**
 * Delete multiple chats in batch with proper error handling
 */
export const deleteMultipleChats = async (chatIds: string[], userId: string) => {
  console.log(`Starting deletion of ${chatIds.length} chats:`, chatIds);
  const results: Array<{ data: any; error: any; chatId: string }> = [];
  const batchSize = 3;
  for (let i = 0; i < chatIds.length; i += batchSize) {
    const batch = chatIds.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}:`, batch);
    const batchPromises = batch.map(async (chatId) => {
      try {
        console.log(`Deleting chat ${chatId}...`);
        const result = await deleteChat(chatId, userId);
        results.push({ ...result, chatId });
        return result;
      } catch (err) {
        console.error(`Failed to delete chat ${chatId}:`, err);
        const failure = { data: null, error: err, chatId };
        results.push(failure);
        return failure;
      }
    });
    await Promise.all(batchPromises);
  }
  const failures = results.filter(r => r.error);
  if (failures.length) {
    console.warn(`deleteMultipleChats completed with ${failures.length} failures.`);
  }
  return { data: results, error: null };
};

export const deleteAllUserChats = async (userId: string) => {
  try {
    // Fetch all chat ids for user first (batched RPC already optimized)
    const { data: chatsData, error: chatsError } = await supabase
      .from('chats')
      .select('id')
      .eq('user_id', userId);
    if (chatsError) return { success: false, error: chatsError.message, deletedCount: 0 };
    const ids = (chatsData||[]).map(c=>c.id);
    if (!ids.length) return { success: true, error: null, deletedCount: 0 };
    // Delete in manageable batches
    const batchSize = 50;
    let deleted = 0;
    for (let i=0; i<ids.length; i+=batchSize) {
      const batch = ids.slice(i,i+batchSize);
      const { error } = await supabase.from('chats').delete().in('id', batch).eq('user_id', userId);
      if (error) return { success: false, error: error.message, deletedCount: deleted };
      deleted += batch.length;
    }
    return { success: true, error: null, deletedCount: deleted };
  } catch (e:any) {
    return { success: false, error: e?.message || String(e), deletedCount: 0 };
  }
};

export const deletePrivateCharacter = async (characterId: string) => {
  try {
    const { data: character, error: fetchError } = await supabase
      .from('characters')
      .select('id, visibility, was_public')
      .eq('id', characterId)
      .maybeSingle<any>();
    if (fetchError) return { error: fetchError };
    if (!character) return { error: new Error('Character not found') };
    const wasPublicFlag = (character as any).was_public;
    if (character.visibility !== 'private' || wasPublicFlag) {
      return { error: new Error('Character cannot be deleted (not private or was previously public)') };
    }
    await supabase.from('character_definitions').delete().eq('character_id', characterId);
    const { error } = await supabase.from('characters').delete().eq('id', characterId).eq('visibility','private');
    return { error };
  } catch (e:any) {
    return { error: e };
  }
};
