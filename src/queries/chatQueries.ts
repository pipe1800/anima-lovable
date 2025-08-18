/**
 * Centralized Query Factory
 * Phase 2 Optimization: Single source of truth for all query keys and configurations
 * 
 * Benefits:
 * - Prevents typos in query keys
 * - Centralized cache configuration 
 * - Easy to update cache strategies
 * - Better IntelliSense support
 */

import { 
  getRecentChatMessages, 
  getEarlierChatMessages,
  getUserCredits,
  getCharacterDetails
} from '@/lib/supabase-queries';
import { convertDatabaseContextToTrackedContext } from '@/utils/contextConverter';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { getUserPersonas, getPersonaById } from '@/lib/persona-operations';

// ============================================================================
// QUERY KEY FACTORY - Prevents typos and ensures consistency
// ============================================================================
export const queryKeys = {
  // Chat queries
  chat: {
    all: ['chat'] as const,
    messages: (chatId: string) => ['chat', 'messages', chatId] as const,
    context: (chatId: string, characterId: string) => ['chat', 'context', chatId, characterId] as const,
    messageCount: (chatId: string) => ['chat', 'message-count', chatId] as const,
  },
  // Personas
  personas: {
    list: (userId: string) => ['personas', userId] as const,
    byId: (personaId: string) => ['persona', personaId] as const,
  },
  // User queries  (extended Phase 3)
  user: {
    all: ['user'] as const,
    credits: (userId: string) => ['user', 'credits', userId] as const,
    profile: (userId: string) => ['user', 'profile', userId] as const,
    favorites: (userId: string) => ['user', 'favorites', userId] as const,
    characters: (userId: string) => ['user', 'characters', userId] as const,
    subscription: (userId: string) => ['user', 'subscription', userId] as const,
    chatsCount: (userId: string) => ['user', 'chats', 'count', userId] as const,
  },
  // Static taxonomy / monetization
  static: {
    tags: ['static', 'tags'] as const,
    plans: ['static', 'plans'] as const,
    creditPacks: ['static', 'credit-packs'] as const,
  },
  // Character queries
  character: {
    all: ['character'] as const,
    details: (characterId: string) => ['character', 'details', characterId] as const,
    settings: (characterId: string) => ['character', 'settings', characterId] as const,
  }
} as const;

// ============================================================================ 
// OPTIMIZED QUERY CONFIGURATIONS - Enhanced for Phase 3 performance
// ============================================================================
export const queryConfigs = {
  // Chat message queries - simplified caching with real-time updates
  chatMessages: (chatId: string) => ({
    queryKey: queryKeys.chat.messages(chatId),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  }),
  // Deprecated: direct head count query removed; use deriveMessageCount util fed from paginated cache
  // User favorites
  userFavorites: (userId: string) => ({
    queryKey: queryKeys.user.favorites(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { getUserFavorites } = await import('@/lib/supabase-queries');
      const { data } = await getUserFavorites(userId);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  }),
  // User characters
  userCharacters: (userId: string) => ({
    queryKey: queryKeys.user.characters(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { getUserCharacters } = await import('@/lib/supabase-queries');
      const { data } = await getUserCharacters(userId);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  }),
  // User subscription
  userSubscription: (userId: string) => ({
    queryKey: queryKeys.user.subscription(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { getUserActiveSubscription } = await import('@/lib/supabase-queries');
      const { data } = await getUserActiveSubscription(userId);
      return data || null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  }),
  // Chats count derived (placeholder until snapshot RPC)
  userChatsCount: (userId: string) => ({
    queryKey: queryKeys.user.chatsCount(userId),
    queryFn: async () => {
      if (!userId) return 0;
      const { getUserChatsBatched } = await import('@/lib/supabase-queries');
      const { data } = await getUserChatsBatched(userId);
      return data.length;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  }),
  // User credits - balanced updates with background refresh
  userCredits: (userId: string) => ({
    queryKey: queryKeys.user.credits(userId),
    queryFn: async () => {
      const result = await getUserCredits(userId);
      if (result.error) throw result.error;
      return result.data?.balance || 0;
    },
    staleTime: 5 * 60 * 1000, // increased to 5m
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  }),
  
  // Character details - aggressive caching for static data
  characterDetails: (characterId: string) => ({
    queryKey: queryKeys.character.details(characterId),
    queryFn: () => getCharacterDetails(characterId),
    staleTime: 10 * 60 * 1000, // 10 minutes (doubled)
    gcTime: 30 * 60 * 1000, // 30 minutes (tripled)
    refetchOnWindowFocus: false, // ✅ PHASE 3: Character data rarely changes
    refetchOnReconnect: false,
  }),
  // Personas
  personasList: (userId: string, opts?: { enabled?: boolean }) => ({
    queryKey: queryKeys.personas.list(userId),
    queryFn: async () => {
      if (!userId) return [];
      return getUserPersonas(userId);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!userId && (opts?.enabled ?? true),
  }),
  personaById: (personaId: string, opts?: { enabled?: boolean }) => ({
    queryKey: queryKeys.personas.byId(personaId),
    queryFn: async () => {
      if (!personaId) return null;
      return getPersonaById(personaId);
    },
    enabled: !!personaId && (opts?.enabled ?? true),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  }),
} as const;

// ============================================================================
// OPTIMIZED INFINITE QUERY CONFIGURATIONS - Enhanced for Phase 3
// ============================================================================
export const infiniteQueryConfigs = {
  chatMessages: (chatId: string) => ({
    queryKey: queryKeys.chat.messages(chatId),
    queryFn: async ({ pageParam = undefined }) => {
      if (!chatId) return { messages: [], hasMore: false, oldestMessageOrder: null };
      
      const limit = 25; // ✅ PHASE 3: Increased from 20 for better batching
      let result;
      
      if (pageParam) {
        result = await getEarlierChatMessages(chatId, pageParam, limit);
      } else {
        result = await getRecentChatMessages(chatId, limit);
      }
      
      if (result.error) throw result.error;
      
      // ✅ PHASE 3: Optimized message transformation with context conversion
      const messages = result.data.map(msg => ({
        id: msg.id,
        content: msg.content,
        isUser: !msg.is_ai_message,
        timestamp: new Date(msg.created_at),
        status: 'sent' as const,
        contextUpdates: (msg as any).message_context?.[0]?.context_updates,
        current_context: convertDatabaseContextToTrackedContext((msg as any).current_context),
        message_order: (msg as any).message_order
      }));
      
      return {
        messages,
        hasMore: result.data.length === limit,
        oldestMessageOrder: result.data.length > 0 ? (result.data[0] as any).message_order : null
      };
    },
    getNextPageParam: (lastPage: any) => lastPage.hasMore ? lastPage.oldestMessageOrder : undefined,
    initialPageParam: undefined,
    enabled: (chatId: string) => !!chatId,
    staleTime: 2 * 60 * 1000, // 2 minutes (increased)
    gcTime: 10 * 60 * 1000, // 10 minutes (increased)
    refetchOnWindowFocus: false, // ✅ PHASE 3: Reduce excessive refetching
    maxPages: 20, // ✅ PHASE 3: Limit memory usage for very long chats
  })
} as const;

// ============================================================================
// QUERY INVALIDATION HELPERS - Consistent cache invalidation
// ============================================================================
export const invalidationHelpers = {
  // Invalidate all chat-related queries
  invalidateChatData: (queryClient: any, chatId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(chatId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.context(chatId, '') });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.messageCount(chatId) });
  },
  
  // Invalidate user-related queries  
  invalidateUserData: (queryClient: any, userId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.user.credits(userId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
  },
  
  // Smart invalidation - only invalidate what's needed
  invalidateAfterMessage: (queryClient: any, chatId: string, userId: string) => {
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.chat.messages(chatId),
      exact: true 
    });
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.user.credits(userId),
      exact: true 
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.chat.messageCount(chatId),
      exact: true
    });
  }
} as const;

// ============================================================================
// TYPE EXPORTS - For better TypeScript support
// ============================================================================
export type QueryKey = 
  | ReturnType<typeof queryKeys.chat.messages>
  | ReturnType<typeof queryKeys.chat.messageCount>
  | ReturnType<typeof queryKeys.user.credits>
  | ReturnType<typeof queryKeys.user.profile>
  | ReturnType<typeof queryKeys.user.favorites>
  | ReturnType<typeof queryKeys.user.characters>
  | ReturnType<typeof queryKeys.user.subscription>
  | ReturnType<typeof queryKeys.user.chatsCount>
  | typeof queryKeys.static.tags
  | typeof queryKeys.static.plans
  | typeof queryKeys.static.creditPacks
  | ReturnType<typeof queryKeys.character.details>
  | ReturnType<typeof queryKeys.personas.list>
  | ReturnType<typeof queryKeys.personas.byId>;

export type QueryConfig = 
  | ReturnType<typeof queryConfigs.chatMessages>
  | ReturnType<typeof queryConfigs.userCredits>
  | ReturnType<typeof queryConfigs.characterDetails>
  | ReturnType<typeof queryConfigs.personasList>
  | ReturnType<typeof queryConfigs.personaById>
  | ReturnType<typeof queryConfigs.userFavorites>
  | ReturnType<typeof queryConfigs.userCharacters>
  | ReturnType<typeof queryConfigs.userSubscription>
  | ReturnType<typeof queryConfigs.userChatsCount>;

export const useUserCredits = (userId: string | undefined, opts?: { enabled?: boolean }) => {
  return useQuery({
    ...(queryConfigs.userCredits(userId || '')),
    enabled: !!userId && (opts?.enabled ?? true),
  });
};
