import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import AppSidebar from '@/components/dashboard/AppSidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { ChatModeChangeModal } from '@/components/character-creator/ChatModeChangeModal';
import { ChatModeMismatchModal } from '@/components/character-creator/ChatModeMismatchModal';
import { ContextSidebar } from './ContextSidebar';
import ChatHeader from './ChatHeader';
import { MemoriesDialog } from './MemoriesDialog';
import PersonaCreateModal from './PersonaCreateModal';
import PersonaEditModal from './PersonaEditModal';
import { useUserGlobalChatSettings } from '@/data/chats/settings';
import { chatQueryConfigs, chatQueryKeys } from '@/data/chats/queryKeys';
import { usePersonaManager, personaKeys } from '@/hooks/chat/usePersonaManager';
import { useWorldInfoSelection } from '@/hooks/chat/useWorldInfoSelection';
import { useCharacterMemories } from '@/hooks/useCharacterMemories';
import { useTutorial } from '@/contexts/TutorialContext';
import { useAuth } from '@/contexts/AuthContext';
import { getMemoryCostExplanation } from '@/lib/memory-cost-calculator';
import { createMemory as createMemoryOp } from '@/lib/memory-operations';
import { getBrowserTimezone } from '@/utils/timezone';
import logger from '@/utils/logger';
import { Chats, CharacterInteractions, CharacterProfileView, CharacterUserSettings } from '@/data';
import type { Persona } from '@/data/personas/mutations';
import { convertDatabaseContextToTrackedContext } from '@/utils/contextConverter';
import type { Character } from '@/types/chat';
import type { TrackedContext } from '@/types/chat';
import type { CharacterFullData } from '@/data/characters/profileView';
import type { UserGlobalChatSettings } from '@/types/chatSettings';
import type { ChatHistoryEntry } from '@/types/chatHistory';
// import RightPanel from './RightPanel';
const RightPanelLazy = lazy(() => import('./RightPanel'));

type CharacterSummary = Awaited<ReturnType<typeof CharacterProfileView.getPublicCharacterSummary>>['data'];
type CharacterDetails = CharacterFullData | CharacterSummary | null;
type ChatModeResult = Awaited<ReturnType<typeof Chats.getChatMode>>['data'];
type UserCharacterSettingsRow = Awaited<ReturnType<typeof CharacterUserSettings.getUserCharacterSettings>>['data'];
type PersonaDraftState = {
  name: string;
  bio: string;
  lore: string;
  avatar_url: string | null;
};

interface PersonaManagerReturn {
  personas: Persona[];
  selectedPersona: Persona | null;
  showCreateModal: boolean;
  setShowCreateModal: React.Dispatch<React.SetStateAction<boolean>>;
  showEditModal: boolean;
  setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
  personaToEdit: Persona | null;
  setPersonaToEdit: React.Dispatch<React.SetStateAction<Persona | null>>;
  currentPersonaDraft: PersonaDraftState;
  setCurrentPersonaDraft: React.Dispatch<React.SetStateAction<PersonaDraftState>>;
  createPersona: (payload: { name: string; bio: string | null; lore: string | null; avatar_url: string | null }) => Promise<Persona>;
  deletePersona: (id: string) => Promise<void>;
  setSelectedPersona: (persona: Persona | null) => void;
}

interface ChatMessagesUpdatedDetail {
  chatId: string;
  count: number;
}

type ChatMessagesUpdatedEvent = CustomEvent<ChatMessagesUpdatedDetail>;

interface CharacterDefinitionSource {
  character_definitions?: {
    initial_addon_context_enabled?: boolean;
    initial_addon_context?: Record<string, unknown> | null;
    personality_summary?: string | Record<string, unknown> | null;
  };
}

interface PersonaSummaryContext {
  initial_addon_context_enabled?: boolean;
  initial_addon_context?: Record<string, unknown> | null;
}

type InitialContextKey =
  | 'mood'
  | 'clothing'
  | 'location'
  | 'time_weather'
  | 'relationship'
  | 'character_position'
  | 'enchantment_status'
  | 'item_inventory';

interface WindowWithCharacterDetails extends Window {
  characterDetails?: CharacterDefinitionSource | null;
}

const isCharacterDefinitionSource = (value: unknown): value is CharacterDefinitionSource => (
  typeof value === 'object' && value !== null && 'character_definitions' in value
);

const safeParseJson = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

interface ChatLayoutProps {
  character: Character;
  children: React.ReactNode;
  currentChatId?: string;
  trackedContext?: TrackedContext;
  onContextUpdate?: (context: TrackedContext) => void;
  onPersonaChange?: (personaId: string | null) => void;
  onWorldInfoChange?: (worldInfoId: string | null) => void;
  characterDetails?: CharacterDetails; // pre-fetched character details to avoid refetch
  creditsBalanceOverride?: number; // provided by page to avoid duplicate /credits queries
  globalSettingsOverride?: UserGlobalChatSettings | null; // provided by page to avoid duplicate global settings fetch
  relationshipStage?: string | null; // NEW canonical relationship stage display
}

export const ChatLayout = ({ character, children, currentChatId, trackedContext, onContextUpdate, onPersonaChange, onWorldInfoChange, characterDetails: characterDetailsOverride, creditsBalanceOverride, globalSettingsOverride, relationshipStage }: ChatLayoutProps) => {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  // Sidebar state
  const [sidebarView, setSidebarView] = useState<'navigation' | 'context'>('navigation');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Auth (include profile for mobile header username)
  const { user: currentUser, profile } = useAuth();

  // Listen for sidebar collapse events from AppSidebar
  useEffect(() => {
    const handleSidebarToggled = () => {
      const savedState = localStorage.getItem('sidebarCollapsed');
      if (savedState) {
        setSidebarCollapsed(JSON.parse(savedState));
      }
    };
    
    // Set initial state
    handleSidebarToggled();
    
    // Listen for changes
    window.addEventListener('sidebarToggled', handleSidebarToggled);
    return () => window.removeEventListener('sidebarToggled', handleSidebarToggled);
  }, []);
  
  // Removed chatHistory and filteredChatHistory local state in favor of query + memo
  const [searchQuery, setSearchQuery] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  // Removed legacy pre-chat greeting selection state (now handled inside ChatInterface)
  // const [greetingSelectionOpen, setGreetingSelectionOpen] = useState(false);
  // const [greetingVariants, setGreetingVariants] = useState<string[]>([]);
  // const [pendingGreetingIndex, setPendingGreetingIndex] = useState<number>(0);
  // const [pendingChatModeAfterGreeting, setPendingChatModeAfterGreeting] = useState<'storytelling' | 'companion' | null>(null);
  const queryClient = useQueryClient();

  // Credits (skip if provided by parent)
  const { data: internalCreditsBalance = 0 } = useQuery({
    ...chatQueryConfigs.userCredits(currentUser?.id || ''),
    enabled: !!currentUser?.id && typeof creditsBalanceOverride !== 'number'
  });
  const creditsBalance = typeof creditsBalanceOverride === 'number' ? creditsBalanceOverride : internalCreditsBalance;
  // Derive username for MobileHeader
  const mobileUsername = profile?.username || currentUser?.email?.split('@')[0] || 'User';

  // Persona manager hook
  const personaManager: PersonaManagerReturn = usePersonaManager(currentUser?.id, currentChatId);
  const resolvePersona = (value: PersonaManagerReturn['selectedPersona']): Persona | null => (
    value && typeof value === 'object' && 'id' in value ? value as Persona : null
  );

  const extractPersonaId = (value: Persona | null): string | null => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return typeof record.id === 'string' ? record.id : null;
  };
  const {
    personas,
    setSelectedPersona,
    showCreateModal,
    setShowCreateModal,
    showEditModal,
    setShowEditModal,
    personaToEdit,
    setPersonaToEdit,
    currentPersonaDraft,
    setCurrentPersonaDraft,
    createPersona: createPersonaAsync,
    deletePersona: deletePersonaAsync,
  } = personaManager;
  const selectedPersona: Persona | null = useMemo(
    () => resolvePersona(personaManager.selectedPersona),
    [personaManager.selectedPersona]
  );
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);

  // Tutorial state
  const { handleStepAction, worldInfoDropdownVisible, disableInteractions, startTutorial, isActive, currentStep } = useTutorial();
  
  // World Info hook
  const { selectedWorldInfoId, selectWorldInfo } = useWorldInfoSelection(currentUser?.id, character.id, onWorldInfoChange);
  
  // Global settings (skip duplicate fetch)
  const { data: internalGlobalSettings } = useUserGlobalChatSettings({ enabled: !globalSettingsOverride });
  const globalSettings = (globalSettingsOverride ?? internalGlobalSettings) ?? undefined;
  const addonSettings = useMemo(() => {
    if (!globalSettings) return undefined;
    return {
      moodTracking: globalSettings.mood_tracking,
      clothingInventory: globalSettings.clothing_inventory,
      locationTracking: globalSettings.location_tracking,
      timeAndWeather: globalSettings.time_and_weather,
      relationshipStatus: globalSettings.relationship_status,
      characterPosition: globalSettings.character_position,
      enchantmentStatus: globalSettings.enchantment_status,
      itemInventory: globalSettings.item_inventory,
    } as const;
  }, [globalSettings]);

  // Message count (replaces HEAD count query): derived from unified chat hook via event
  const [currentChatMessageCount, setCurrentChatMessageCount] = useState(0);
  const messageCountLoading = false; // no network loading now
  useEffect(() => {
    const listener: EventListener = (event) => {
      const customEvent = event as ChatMessagesUpdatedEvent;
      const detail = customEvent.detail;
      if (!detail || detail.chatId !== currentChatId) return;
      setCurrentChatMessageCount(detail.count ?? 0);
    };
    window.addEventListener('chat-messages-updated', listener);
    return () => window.removeEventListener('chat-messages-updated', listener);
  }, [currentChatId]);
  
  // Memories Dialog state
  const [showMemoriesDialog, setShowMemoriesDialog] = useState(false);
  const { memories, loading: memoriesLoading, error: memoriesError, refreshMemories } = useCharacterMemories(
    character.id,
    currentUser?.id
  );
  
  // Chat mode state
  const [chatMode, setChatMode] = useState<'storytelling' | 'companion'>('storytelling');
  const [chatModeLoading, setChatModeLoading] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingChatMode, setPendingChatMode] = useState<'storytelling' | 'companion' | null>(null);
  const [currentChat, setCurrentChat] = useState<ChatModeResult | null>(null);
  
  // Time awareness state
  const [timeAwarenessEnabled, setTimeAwarenessEnabled] = useState(false);
  const [timeAwarenessLoading, setTimeAwarenessLoading] = useState(false);
  // Reuse existing globalSettings above (removed duplicate declaration)
  const [isCreatingMemory, setIsCreatingMemory] = useState(false);
  const [userTimezone, setUserTimezone] = useState<string>('UTC');

  // Timezone (no longer in loadData)
  useEffect(() => {
    setUserTimezone(getBrowserTimezone());
  }, []);
  
  // Debug Enhanced Memory detection
  useEffect(() => {
    logger.debug('🧠 Enhanced Memory Debug:', {
      globalSettings,
      enhancedMemoryEnabled: globalSettings?.enhanced_memory,
      currentChatId,
      shouldShowButton: globalSettings?.enhanced_memory && currentChatId
    });
  }, [globalSettings, currentChatId]);

  // Debug Tutorial - Memories Button
  useEffect(() => {
    logger.debug('🧠 Tutorial Debug - Memories Button:', {
      isActive,
      currentStep,
      globalSettings,
      enhancedMemory: globalSettings?.enhanced_memory,
      shouldShowButton: (globalSettings?.enhanced_memory || (isActive && currentStep === 6))
    });
  }, [isActive, currentStep, globalSettings]);

  // Auto-close right panel when tutorial completes
  const prevIsActive = useRef(isActive);
  useEffect(() => {
    if (prevIsActive.current && !isActive && rightPanelOpen) {
      logger.info('🎓 Tutorial just completed, closing right panel');
      setRightPanelOpen(false);
    }
    prevIsActive.current = isActive;
  }, [isActive, rightPanelOpen]);
  
  const navigate = useNavigate();

  // =========================
  // React Query migrations
  // =========================
  // Character details
  const characterDetailsQuery = useQuery<CharacterSummary | null>({
    ...chatQueryConfigs.characterSummary(character.id),
    enabled: !characterDetailsOverride,
  });
  const characterDetails = useMemo<CharacterDetails>(() => (
    characterDetailsOverride ?? characterDetailsQuery.data ?? null
  ), [characterDetailsOverride, characterDetailsQuery.data]);

  // User chats
  const { data: chats = [], isLoading: chatsLoading } = useQuery<ChatHistoryEntry[]>({
    queryKey: ['user', 'chats', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const { data } = await Chats.getUserChatsPaginated(currentUser.id, 1, 50);
      return (data ?? []).map((chat) => {
        const entry: ChatHistoryEntry = {
          id: chat.chat_id,
          title: chat.character_name,
          character: {
            id: chat.character_id,
            name: chat.character_name ?? 'Unknown',
            avatar_url: chat.character_avatar_url,
            short_description: null,
            tagline: null,
          },
          message_count: chat.message_count ?? 0,
          last_message_at: chat.last_message?.created_at ?? null,
          created_at: chat.chat_created_at,
          userSettings: null,
          lastMessage: chat.last_message?.content ?? null,
          messages: chat.last_message ? [{ content: chat.last_message.content }] : null,
        };
        return entry;
      });
    },
    enabled: !!currentUser?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const filteredChatHistory = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    return chats.filter((chat) => {
      const characterName = chat.character?.name?.toLowerCase() ?? '';
      const title = chat.title?.toLowerCase() ?? '';
      return characterName.includes(query) || title.includes(query);
    });
  }, [chats, searchQuery]);

  // Likes / Favorites
  const likedQuery = useQuery({
    queryKey: ['character', 'liked', currentUser?.id, character.id],
    queryFn: async () => currentUser ? CharacterInteractions.isCharacterLiked(character.id, currentUser.id) : false,
    enabled: !!currentUser?.id,
  });
  useEffect(() => setIsLiked(!!likedQuery.data), [likedQuery.data]);

  const favoritedQuery = useQuery({
    queryKey: ['character', 'favorited', currentUser?.id, character.id],
    queryFn: async () => currentUser ? CharacterInteractions.isCharacterFavorited(character.id, currentUser.id) : false,
    enabled: !!currentUser?.id,
  });
  useEffect(() => setIsFavorited(!!favoritedQuery.data), [favoritedQuery.data]);

  // User character settings
  const userCharSettingsQuery = useQuery<UserCharacterSettingsRow | null>({
    queryKey: ['user', 'character-settings', currentUser?.id, character.id],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const { data } = await CharacterUserSettings.getUserCharacterSettings(currentUser.id, character.id);
      return data ?? null;
    },
    enabled: !!currentUser?.id,
  });
  const userCharacterSettings = userCharSettingsQuery.data;
  useEffect(() => {
    const mode = userCharacterSettings?.chat_mode;
    if (mode === 'storytelling' || mode === 'companion') {
      setChatMode(mode);
    }
    if (userCharacterSettings?.time_awareness_enabled !== undefined) {
      setTimeAwarenessEnabled(Boolean(userCharacterSettings.time_awareness_enabled));
    }
  }, [userCharacterSettings?.chat_mode, userCharacterSettings?.time_awareness_enabled]);

  // Current chat metadata
  const currentChatModeQuery = useQuery<ChatModeResult | null>({
    queryKey: ['chat', 'mode', currentChatId, currentUser?.id],
    queryFn: async () => {
      if (!currentChatId || !currentUser?.id) return null;
      const { data } = await Chats.getChatMode(currentChatId, currentUser.id);
      return data ?? null;
    },
    enabled: !!currentChatId && !!currentUser?.id,
  });
  useEffect(() => {
    const chatData = currentChatModeQuery.data;
    setCurrentChat(chatData ?? null);
    const chatModeValue = chatData?.chat_mode;
    const settingsMode = userCharacterSettings?.chat_mode;
    setShowMismatchModal(Boolean(chatModeValue && settingsMode && chatModeValue !== settingsMode));
  }, [currentChatModeQuery.data, userCharacterSettings?.chat_mode]);

  // Notify parent when persona changes (from hook)
  useEffect(() => {
    if (!onPersonaChange) return;
    const personaId = extractPersonaId(selectedPersona);
    logger.debug('🎭 ChatLayout: Notifying parent of persona change:', personaId);
    onPersonaChange(personaId);
  }, [selectedPersona, onPersonaChange]);

  // Reload persona data for current chat -> invalidate selected query
  const handlePersonaSaved = async () => {
    if (!currentChatId || !currentUser) return;
    logger.debug('🔄 Reloading persona data after save for chat:', currentChatId);
    queryClient.invalidateQueries({ queryKey: personaKeys.context(currentUser?.id, currentChatId || null, true) });
  };

  const handleEditCharacter = () => {
    navigate(`/character-creator?edit=${character.id}`);
  };

  const handleLike = async () => {
    if (!currentUser) return;
    try {
      const newState = await CharacterInteractions.toggleCharacterLike(character.id, currentUser.id);
      setIsLiked(newState);
      queryClient.invalidateQueries({ queryKey: ['character', 'liked', currentUser?.id, character.id] });
    } catch (error: unknown) {
      logger.error('Error updating like status:', error);
    }
  };

  const handleFavorite = async () => {
    if (!currentUser) return;
    try {
      const newState = await CharacterInteractions.toggleCharacterFavorite(character.id, currentUser.id);
      setIsFavorited(newState);
      queryClient.invalidateQueries({ queryKey: ['character', 'favorited', currentUser?.id, character.id] });
    } catch (error: unknown) {
      logger.error('Error updating favorite status:', error);
    }
  };

  // Sidebar toggle handlers
  const handleSidebarToggle = useCallback((view: 'navigation' | 'context') => {
    setSidebarView(view);
    // Don't reset collapsed state - let AppSidebar manage it
  }, []);

  const handleSidebarModeToggle = useCallback(() => {
    setSidebarView(prev => prev === 'navigation' ? 'context' : 'navigation');
    // Don't reset collapsed state - let AppSidebar manage it
  }, []);

  // Count active context items for the badge
  const contextCount = useMemo(() => {
    if (!trackedContext) return 0;
    return Object.values(trackedContext).filter(value => 
      value && value !== 'No context' && value.trim() !== ''
    ).length;
  }, [trackedContext]);

  // Auto-switch to context view when context becomes available
  useEffect(() => {
    if (trackedContext && sidebarView === 'navigation') {
      const hasContext = Object.values(trackedContext).some(value => 
        value && value !== 'No context' && value.trim() !== ''
      );
      if (hasContext) {
        // Don't auto-switch, let user manually toggle to see the context
        // setSidebarView('context');
      }
    }
  }, [trackedContext, sidebarView]);

  const handleRightPanelToggle = useCallback(() => {
    logger.debug('🔧 Right panel toggle clicked:', { isActive, currentStep, rightPanelOpen });
    setRightPanelOpen(prev => !prev);
  }, [isActive, currentStep, rightPanelOpen]);

  // Advance tutorial after panel actually opens (Step 3 -> 4)
  useEffect(() => {
    if (isActive && currentStep === 2 && rightPanelOpen) {
      logger.debug('🎓 Right panel opened, advancing tutorial from step 3 to 4');
      handleStepAction('right-panel-toggled');
    }
  }, [isActive, currentStep, rightPanelOpen, handleStepAction]);

  // World Info selection handler -> use hook
  const handleWorldInfoSelect = (worldInfo: { id: string; name: string } | null) => {
    logger.debug('🌍 ChatLayout: World info selection changed:', worldInfo);
    selectWorldInfo(worldInfo);
  };

  // Persona handlers using hook
  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result !== 'string') return;
        setCurrentPersonaDraft(prev => ({
          ...prev,
          avatar_url: result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPersona = async () => {
    if (!currentUser) {
      toast.error('You must be logged in to create personas');
      return;
    }
    if (!currentPersonaDraft.name.trim()) {
      toast.error('Please enter a persona name');
      return;
    }

    setIsCreatingPersona(true);
    try {
      const newPersona = await createPersonaAsync({
        name: currentPersonaDraft.name.trim(),
        bio: currentPersonaDraft.bio.trim() || null,
        lore: currentPersonaDraft.lore.trim() || null,
        avatar_url: currentPersonaDraft.avatar_url,
      });
      setSelectedPersona(newPersona);
      setShowCreateModal(false);
      toast.success('Persona created successfully!');
    } catch (error: unknown) {
      logger.error('Error creating persona:', error);
      toast.error('Failed to create persona');
    } finally {
      setIsCreatingPersona(false);
    }
  };

  const handleRemovePersona = async (id: string) => {
    try {
      await deletePersonaAsync(id);
      toast.success('Persona removed');
    } catch (error: unknown) {
      logger.error('Error removing persona:', error);
      toast.error('Failed to remove persona');
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!currentUser) return;

    // Optimistically remove from chat history cache
    queryClient.setQueryData<ChatHistoryEntry[]>(['user', 'chats', currentUser.id], (old) => {
      if (!old) return old;
      return old.filter(chat => chat.id !== chatId);
    });

    // If deleting the currently open chat, navigate to character base route immediately
    if (chatId === currentChatId) {
      navigate(`/chat/${character.id}`);
    }

    try {
      const { error } = await Chats.deleteChat(chatId, currentUser.id);
      if (error) throw error;

      toast.success('Chat deleted successfully');
      // Ensure server truth
      queryClient.invalidateQueries({ queryKey: ['user', 'chats', currentUser.id] });
    } catch (error: unknown) {
      logger.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
      // Revalidate to restore correct state if optimistic update was wrong
      queryClient.invalidateQueries({ queryKey: ['user', 'chats', currentUser.id] });
    }
  };

  // Handle chat mode changes
  const handleChatModeChange = async (mode: 'storytelling' | 'companion') => {
    setPendingChatMode(mode);
    setShowChangeModal(true);
  };

  // Handle confirming chat mode change
  const handleConfirmChatModeChange = async () => {
    if (!currentUser || !pendingChatMode) return;
    setChatModeLoading(true);
    try {
      await CharacterUserSettings.upsertUserCharacterSettings(currentUser.id, character.id, { chat_mode: pendingChatMode });
      setChatMode(pendingChatMode);
      await handleStartNewChat();
      toast.success(`Chat mode updated to ${pendingChatMode}`, {
        description: 'A new chat has been created with the updated mode'
      });
      queryClient.invalidateQueries({ queryKey: ['user', 'character-settings', currentUser.id, character.id] });
    } catch (error: unknown) {
      logger.error('Error updating chat mode:', error);
      toast.error('Failed to update chat mode');
    } finally {
      setChatModeLoading(false);
      setShowChangeModal(false);
      setPendingChatMode(null);
    }
  };

  // Handle time awareness toggle
  const handleTimeAwarenessChange = async (enabled: boolean) => {
    if (!currentUser) return;
    setTimeAwarenessLoading(true);
    try {
      await CharacterUserSettings.upsertUserCharacterSettings(currentUser.id, character.id, { time_awareness_enabled: enabled });
      setTimeAwarenessEnabled(enabled);
      toast.success(`Time awareness ${enabled ? 'enabled' : 'disabled'}`, {
        description: enabled 
          ? 'The character will now react to response delays based on their personality'
          : 'The character will no longer react to response delays'
      });
      queryClient.invalidateQueries({ queryKey: ['user', 'character-settings', currentUser.id, character.id] });
    } catch (error: unknown) {
      logger.error('Error updating time awareness:', error);
      toast.error('Failed to update time awareness setting');
    } finally {
      setTimeAwarenessLoading(false);
    }
  };

  // Start new chat now simply navigates to character route (deferred creation in ChatInterface)
  const handleStartNewChat = async () => {
    if (!currentUser) return;
    navigate(`/chat/${character.id}`);
  };
  const handleConfirmGreetingSelection = async () => {
    // Removed: legacy greeting modal confirm (handled in ChatInterface)
  };
  const handleCancelGreetingSelection = () => {
    // Removed: legacy greeting modal cancel
  };

  // Derived flags (restored after refactor)
  const isCharacterOwner = currentUser && characterDetails && currentUser.id === characterDetails.creator_id;
  const loading = chatsLoading || (!characterDetailsOverride && characterDetailsQuery.isLoading);
  const showMemoriesButton = (globalSettings?.enhanced_memory || (isActive && currentStep === 6)) && !!currentChatId;
  const memoriesCount = memories?.length || 0;

  // Memory creation handler (restored)
  const handleCreateMemory = async () => {
    if (!currentUser || !currentChatId || isCreatingMemory) return;
    setIsCreatingMemory(true);
    try {
      const data = await createMemoryOp(currentChatId, character.id);
      if (data?.success) {
        const creditCost = data.data?.creditCost || 0;
        toast.success('Memory created successfully! 🧠', {
          description: `Conversation summarized with ${data.data?.messageCount || 0} messages processed. ${creditCost} credits deducted.`,
        });
  // Removed: message count query invalidation (now event-driven & derived)
        if (currentUser?.id) {
          queryClient.invalidateQueries({ queryKey: chatQueryKeys.user.credits(currentUser.id), exact: true });
        }
      } else {
        throw new Error(data?.message || data?.error || 'Failed to create memory');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again later.';
      logger.error('Error creating memory:', error);
      toast.error('Failed to create memory', { description: message });
    } finally {
      setIsCreatingMemory(false);
    }
  };

  useEffect(() => {
    const fetchInitialContext = async () => {
      try {
        if (!currentChatId || !currentUser?.id || !character?.id) return;
        const { data, error } = await Chats.getChatContext({ chatId: currentChatId, userId: currentUser.id, characterId: character.id });
        if (error) {
          const message = 'message' in error ? (error as { message?: string }).message : String(error);
          logger.warn('Context fetch skipped/failed:', message);
          return;
        }
        const tracked = data?.current_context ? convertDatabaseContextToTrackedContext(data.current_context) : null;
        if (tracked && onContextUpdate) {
          onContextUpdate(tracked);
        }
      } catch (error: unknown) {
        logger.error('Failed to fetch initial context:', error);
      }
    };
    fetchInitialContext();
  }, [currentChatId, currentUser?.id, character?.id, onContextUpdate]);

  const preChatInitialContextSeededRef = useRef(false);
  useEffect(() => {
    if (currentChatId || preChatInitialContextSeededRef.current || !onContextUpdate) return;

    const windowCharacterDetails = typeof window !== 'undefined'
      ? (window as WindowWithCharacterDetails).characterDetails
      : null;

    const definitionSource = (
      (characterDetailsOverride && isCharacterDefinitionSource(characterDetailsOverride) ? characterDetailsOverride : null)
      ?? (windowCharacterDetails && isCharacterDefinitionSource(windowCharacterDetails) ? windowCharacterDetails : null)
      ?? (isCharacterDefinitionSource(character as unknown) ? character as CharacterDefinitionSource : null)
    );

    const definitions = definitionSource?.character_definitions ?? null;
    if (!definitions) return;

    let initialCtx: Record<string, unknown> | null = null;
    try {
      if (definitions.initial_addon_context_enabled && definitions.initial_addon_context && typeof definitions.initial_addon_context === 'object') {
        initialCtx = definitions.initial_addon_context;
      } else if (definitions.personality_summary) {
        const parsedSummary = typeof definitions.personality_summary === 'string'
          ? safeParseJson<PersonaSummaryContext>(definitions.personality_summary)
          : definitions.personality_summary as PersonaSummaryContext | null;
        if (parsedSummary?.initial_addon_context_enabled && parsedSummary.initial_addon_context && typeof parsedSummary.initial_addon_context === 'object') {
          initialCtx = parsedSummary.initial_addon_context;
        }
      }
    } catch (error) {
      logger.debug('Failed to parse initial addon context; continuing without seeding', error);
    }

    if (!initialCtx) return;

    const pick = (key: InitialContextKey) => {
      const value = initialCtx?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      return 'No context';
    };

    const mapped: TrackedContext = {
      moodTracking: pick('mood'),
      clothingInventory: pick('clothing'),
      locationTracking: pick('location'),
      timeAndWeather: pick('time_weather'),
      relationshipStatus: pick('relationship'),
      characterPosition: pick('character_position'),
      enchantmentStatus: pick('enchantment_status'),
      itemInventory: pick('item_inventory'),
    };

    const hasContextValue = Object.values(mapped).some(value => value && value !== 'No context');
    if (!hasContextValue) return;

    preChatInitialContextSeededRef.current = true;
    try {
      onContextUpdate(mapped);
    } catch (error) {
      logger.warn('Failed to propagate initial manual addon context', error);
    }
  }, [currentChatId, onContextUpdate, characterDetailsOverride, character]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#121212]">
      {sidebarView === 'navigation' ? (
        <AppSidebar 
          sidebarMode={sidebarView}
          onToggleMode={handleSidebarModeToggle}
          contextCount={contextCount}
        />
      ) : (
        <ContextSidebar
          context={trackedContext}
          addonSettings={addonSettings}
          character={{ id: character.id, name: character.name, avatar_url: character.avatar_url ?? undefined }}
          onBackToNav={() => setSidebarView('navigation')}
        />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <MobileHeader title={character.name} userCredits={creditsBalance} username={mobileUsername} showFavoriteIcon={false} />
        <ChatHeader character={character} relationshipStage={relationshipStage} characterDetails={characterDetailsOverride || character} creditsBalance={creditsBalance} currentUser={currentUser} isCreatingMemory={isCreatingMemory} currentChatId={currentChatId} onConfirmCreateMemory={handleCreateMemory} onToggleRightPanel={() => setRightPanelOpen(!rightPanelOpen)} isTutorialActive={isActive} currentStep={currentStep} startTutorial={startTutorial} isMessageCountLoading={messageCountLoading} messageCount={currentChatMessageCount} getMemoryCostText={getMemoryCostExplanation} />
        <div className="flex-1 overflow-hidden" style={{ pointerEvents: disableInteractions ? 'none' : 'auto' }}>
          {children}
        </div>
      </div>

      {/* Right Panel */}
      <Suspense fallback={null}>
        <RightPanelLazy
          open={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          onConfigTabClicked={() => handleStepAction('config-tab-clicked')}
          loading={loading}
          filteredChatHistory={filteredChatHistory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          currentChatId={currentChatId}
          onSelectChat={(characterId: string, chatId: string) => {
            if (!characterId || chatId === currentChatId) return;
            navigate(`/chat/${characterId}/${chatId}`);
          }}
          onDeleteChat={handleDeleteChat}
          character={character}
          characterDetails={characterDetails}
          isCharacterOwner={!!isCharacterOwner}
          onStartNewChat={handleStartNewChat}
          isCreatingNewChat={isCreatingNewChat}
          onEditCharacter={handleEditCharacter}
          showMemoriesButton={showMemoriesButton}
          memoriesCount={memoriesCount}
          onOpenMemories={() => setShowMemoriesDialog(true)}
          isLiked={isLiked}
          onLike={handleLike}
          isFavorited={isFavorited}
          onFavorite={handleFavorite}
          currentUser={currentUser}
          chatMode={chatMode}
          onChatModeChange={handleChatModeChange}
          chatModeLoading={chatModeLoading}
          timeAwarenessEnabled={timeAwarenessEnabled}
          onTimeAwarenessChange={handleTimeAwarenessChange}
          timeAwarenessLoading={timeAwarenessLoading}
          userTimezone={userTimezone}
          worldInfoDropdownVisible={worldInfoDropdownVisible}
          onWorldInfoSelect={handleWorldInfoSelect}
          selectedWorldInfoId={selectedWorldInfoId}
          currentUserId={currentUser?.id}
          personas={personas}
          selectedPersona={selectedPersona}
          setSelectedPersona={setSelectedPersona}
          setShowPersonaModal={setShowCreateModal}
          setShowEditPersonaModal={setShowEditModal}
          setPersonaToEdit={setPersonaToEdit}
          onPersonaSaved={handlePersonaSaved}
        />
      </Suspense>

      {/* Memories Dialog */}
      <MemoriesDialog
        open={showMemoriesDialog}
        onOpenChange={setShowMemoriesDialog}
        memories={memories || []}
        loading={memoriesLoading}
        error={memoriesError || null}
        characterName={character.name}
        onRefresh={refreshMemories}
      />

      <ChatModeMismatchModal
        isOpen={showMismatchModal}
        onClose={() => setShowMismatchModal(false)}
        chatMode={currentChat?.chat_mode || chatMode}
        characterMode={chatMode}
        onCreateNewChat={handleStartNewChat}
        onChangeCharacterMode={() => handleChatModeChange(currentChat?.chat_mode || chatMode)}
      />

      <ChatModeChangeModal
        isOpen={showChangeModal}
        onClose={() => setShowChangeModal(false)}
        newMode={pendingChatMode || chatMode}
        onConfirm={handleConfirmChatModeChange}
      />

      {/* Persona create modal */}
      <PersonaCreateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        currentPersona={currentPersonaDraft}
        setCurrentPersona={setCurrentPersonaDraft}
        isCreating={isCreatingPersona}
        onCreate={handleAddPersona}
        onAvatarChange={handleAvatarChange}
      />

      {/* Persona edit modal */}
      {personaToEdit && (
        <PersonaEditModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          personaToEdit={personaToEdit}
          setPersonaToEdit={setPersonaToEdit}
          isSaving={isCreatingPersona}
          onSave={handlePersonaSaved}
        />
      )}
    </div>
  );
};
