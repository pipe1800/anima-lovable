// Chat domain React Query keys & configs (moved from /queries)
import { Chats, CharacterDetails, Billing } from '@/data';
import { convertDatabaseContextToTrackedContext } from '@/utils/contextConverter';
import { supabase } from '@/db/client';

export const chatQueryKeys = {
  chat: {
    all: ['chat'] as const,
    messages: (chatId: string) => ['chat', 'messages', chatId] as const,
    context: (chatId: string, characterId: string) => ['chat', 'context', chatId, characterId] as const,
  },
  user: {
    all: ['user'] as const,
    credits: (userId: string) => ['user', 'credits', userId] as const,
    profile: (userId: string) => ['user', 'profile', userId] as const,
  },
  character: {
    all: ['character'] as const,
    details: (characterId: string) => ['character', 'details', characterId] as const,
    settings: (characterId: string) => ['character', 'settings', characterId] as const,
  }
} as const;

export const chatQueryConfigs = {
  chatMessages: (chatId: string) => ({
    queryKey: chatQueryKeys.chat.messages(chatId),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  }),
  userCredits: (userId: string) => ({
    queryKey: chatQueryKeys.user.credits(userId),
    queryFn: async () => {
      const result = await Billing.getUserCredits(supabase, userId);
      if (result.error) throw result.error;
      return result.data?.balance || 0;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  }),
  characterDetails: (characterId: string) => ({
    queryKey: chatQueryKeys.character.details(characterId),
    queryFn: () => CharacterDetails.getCharacterDetails(characterId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }),
} as const;

export const chatInfiniteQueryConfigs = {
  chatMessages: (chatId: string) => ({
    queryKey: chatQueryKeys.chat.messages(chatId),
    queryFn: async ({ pageParam = undefined }) => {
      if (!chatId) return { messages: [], hasMore: false, oldestMessageOrder: null };
      const limit = 25;
      const result = await Chats.getChatMessages(chatId, limit, pageParam);
      if (result.error) throw result.error;
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
        hasMore: result.hasMore,
        oldestMessageOrder: messages.length > 0 ? messages[0].message_order : null
      };
    },
    getNextPageParam: (lastPage: any) => lastPage.hasMore ? lastPage.oldestMessageOrder : undefined,
    initialPageParam: undefined,
    enabled: !!chatId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    maxPages: 20,
  })
} as const;

export const chatInvalidationHelpers = {
  invalidateChatData: (queryClient: any, chatId: string) => {
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.chat.messages(chatId) });
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.chat.context(chatId, '') });
  },
  invalidateUserData: (queryClient: any, userId: string) => {
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.user.credits(userId) });
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.user.profile(userId) });
  },
  invalidateAfterMessage: (queryClient: any, chatId: string, userId: string) => {
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.chat.messages(chatId), exact: true });
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.user.credits(userId), exact: true });
  }
} as const;

export type ChatQueryKey =
  | ReturnType<typeof chatQueryKeys.chat.messages>
  | ReturnType<typeof chatQueryKeys.user.credits>
  | ReturnType<typeof chatQueryKeys.character.details>;

export type ChatQueryConfig =
  | ReturnType<typeof chatQueryConfigs.chatMessages>
  | ReturnType<typeof chatQueryConfigs.userCredits>
  | ReturnType<typeof chatQueryConfigs.characterDetails>;
