import { supabase } from '@/integrations/supabase/client'
import type { Profile, Character, Plan, Subscription, Credits, Chat, Message, OnboardingChecklistItem, UserOnboardingProgress } from '@/types/database'
import { getUserPersonas } from '@/lib/persona-operations'
import type { SearchParams } from '@/types/search'

// =============================================================================
// SEARCH INTERFACES (relocated to @/types/search)
// =============================================================================
// SearchResult kept locally for generic typing
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
// MONETIZATION QUERIES - Plans, Models, Credit Packs (snapshot-first; legacy removed)
// =============================================================================

/**
 * Get all active subscription plans (new canonical table: plans)
 * NOTE: Prefer using snapshot (bootstrapStore.subscription.plan) for the current user's plan.
 */
export const getActivePlans = async () => {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });
  return { data, error };
};

/**
 * Get all active AI models (joins to min required plan by new plans table)
 */
export const getActiveModels = async () => {
  const { data, error } = await supabase
    .from('models')
    .select(`
      *,
      min_plan:plans(name, price_monthly)
    `)
    .eq('is_active', true)
    .order('credit_multiplier', { ascending: true });
  return { data, error };
};

/**
 * Get all active credit packs (unchanged)
 */
export const getActiveCreditPacks = async () => {
  const { data, error } = await supabase
    .from('credit_packs')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });
  return { data, error };
};

/**
 * (Deprecated shim) Get user's current active subscription.
 * Snapshot (bootstrapStore.subscription) should be used. This now queries new canonical tables only
 * if snapshot not yet hydrated.
 */
export const getUserActiveSubscription = async (userId: string) => {
  return fetchOnce(`active-subscription:${userId}`, async () => {
    const { bootstrapStore } = await import('@/state/bootstrap-store');
    if (bootstrapStore.subscription && bootstrapStore.userId === userId) {
      return { data: bootstrapStore.subscription, error: null } as any;
    }
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select(`id, user_id, plan_id, status, current_period_end, created_at, plan:plans(*)`)
      .eq('user_id', userId)
      .in('status', ['active','trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data: sub, error };
  });
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

// DEPRECATED: getPrivateProfile removed in favor of snapshot (BootstrapStore.profile)
// Attempted legacy imports should be migrated. Keeping shim for transitional compatibility.
export const getPrivateProfile = async (userId: string) => {
  console.warn('[deprecated] getPrivateProfile: use bootstrap store profile instead');
  const { bootstrapStore } = await import('@/state/bootstrap-store');
  if (bootstrapStore.profile && bootstrapStore.profile.id === userId) {
    return { data: bootstrapStore.profile, error: null } as any;
  }
  // Fallback minimal fetch (should not normally occur)
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
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
    let rows = data as any[];
    if (!nsfwEnabled) rows = rows.filter(r => !r.is_nsfw);
    return { data: rows, error: null };
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
    let rows = data as any[];
    if (filters.nsfw === false) rows = rows.filter(r => !r.is_nsfw);
    if (filters.tags && filters.tags.length) {
      rows = rows.filter(r => (r.tag_names || []).some((t: string) => filters.tags!.includes(t)));
    }
    if (sortBy === 'conversations') {
      rows.sort((a, b) => (b.chats_count || 0) - (a.chats_count || 0));
    }
    const total = count || 0;
    const hasMore = offset + limit < total;
    return { data: rows, total, hasMore };
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
    .from('character_profile_view')
    .select('*')
    .eq('id', characterId)
    .maybeSingle();
  if (error || !data) {
    return { data: null, error };
  }
  const row: any = data as any; // view-specific dynamic fields
  const enriched = {
    ...row,
    creator: row.creator_username ? { id: row.creator_id, username: row.creator_username, avatar_url: row.creator_avatar_url } : null,
    definition: row.personality_summary || row.greeting ? [{ greeting: row.greeting, personality_summary: row.personality_summary }] : [],
    tags: row.tags || []
  };
  return { data: enriched, error: null };
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
// BILLING QUERIES (legacy removed in favor of snapshot + canonical tables)
// =============================================================================

/**
 * (Removed legacy) getSubscriptionPlans => use getActivePlans.
 * (Removed legacy) getUserSubscription => use snapshot or getUserActiveSubscription.
 * (Removed legacy) getUserCredits => use bootstrapStore.credits (snapshot) or direct 'credits' table.
 */

// Removed getUserSubscription / getUserCredits (use bootstrap store)

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
export async function consumeCredits(userId: string, credits: number): Promise<{ data: { success: boolean; balance: number } | null, error: any }> {
  // Optimistic decrement (will be corrected by authoritative RPC result)
  try {
    const { bootstrapActions, getBootstrapState } = await import('@/state/bootstrap-store');
    const st = getBootstrapState();
    if (st.userId === userId && typeof credits === 'number' && credits > 0) {
      bootstrapActions.decrementCredits(credits);
    }
  } catch { /* ignore */ }
  const started = performance.now();
  const { data, error } = await supabase
    .rpc('consume_credits', { 
      user_id_param: userId,
      credits_to_consume: credits 
    });
  const duration = performance.now() - started;
  if (error) return { data: null, error };
  const success = !!(data as any)?.success;
  const balance = (data as any)?.balance ?? null;
  // Authoritative store update
  try {
    const { bootstrapActions, getBootstrapState } = await import('@/state/bootstrap-store');
    const st = getBootstrapState();
    if (st.userId === userId && typeof balance === 'number') {
      bootstrapActions.setCredits(balance);
    }
    // Basic in-memory metrics accumulator
    ;(window as any).__creditMetrics = (window as any).__creditMetrics || { calls: 0, lastDuration: 0, totalDuration: 0 };
    (window as any).__creditMetrics.calls += 1;
    (window as any).__creditMetrics.lastDuration = duration;
    (window as any).__creditMetrics.totalDuration += duration;
  } catch { /* ignore */ }
  return { data: { success, balance }, error: null };
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
// WORLD INFO QUERIES (legacy removed - use snapshots & hooks)
// =============================================================================
// Removed getPublicWorldInfos & searchPublicWorldInfos in favor of snapshot-driven hooks.
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
  const sortedFavorites = [...rows].sort(
    (a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
  );
  return { data: sortedFavorites, error: null };
}

/**
 * Get recommended characters based on tags and popularity
 */
export const getRecommendedCharacters = async (tags: string[], limit = 4) => {
  try {
    let query = supabase
      .from('character_profile_view')
      .select('*')
      .eq('visibility', 'public');

    if (tags.length) {
      // Filter client-side after fetch if small limit: fetch a little extra
      const fetchLimit = Math.min(limit * 3, 60);
      query = query.order('interaction_count', { ascending: false }).limit(fetchLimit);
      const { data, error } = await query;
      if (error || !data) return { data: [], error };
      const filtered = (data as any[]).filter(r => (r.tag_names || []).some((t: string) => tags.includes(t)))
        .slice(0, limit);
      const finalRows = filtered.length ? filtered : data.slice(0, limit);
      return { data: finalRows, error: null };
    } else {
      const { data, error } = await query
        .order('interaction_count', { ascending: false })
        .limit(limit);
      return { data: data || [], error };
    }
  } catch (error) {
    console.error('Error getting recommended characters:', error);
    return { data: [], error };
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
    if (!error) {
      try { const { bootstrapActions } = await import('@/state/bootstrap-store'); bootstrapActions.removeRecentChat?.(chatId); } catch {}
    }
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
        if (!result.error) { try { const { bootstrapActions } = await import('@/state/bootstrap-store'); bootstrapActions.removeRecentChat?.(chatId); } catch {} }
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
    const { data: chatsData, error: chatsError } = await supabase
      .from('chats')
      .select('id')
      .eq('user_id', userId);
    if (chatsError) return { success: false, error: chatsError.message, deletedCount: 0 };
    const ids = (chatsData||[]).map(c=>c.id);
    if (!ids.length) return { success: true, error: null, deletedCount: 0 };
    const batchSize = 50;
    let deleted = 0;
    for (let i=0; i<ids.length; i+=batchSize) {
      const batch = ids.slice(i,i+batchSize);
      const { error } = await supabase.from('chats').delete().in('id', batch).eq('user_id', userId);
      if (error) return { success: false, error: error.message, deletedCount: deleted };
      deleted += batch.length;
    }
    try { const { bootstrapActions } = await import('@/state/bootstrap-store'); ids.forEach(id => bootstrapActions.removeRecentChat?.(id)); } catch {}
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

// TODO: Implement server-side world info search RPC (get_world_info_search_snapshot) and remove client-side filtering in useWorldInfos.
