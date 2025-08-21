import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
// import { supabase } from '@/db/client';
import { Chats } from '@/data';
import { CharacterInteractions } from '@/data';
import type { Persona } from '@/data/personas/mutations';
import { useUserGlobalChatSettings } from '@/data/chats/settings';
import { CharacterUserSettings } from '@/data';
import { getBrowserTimezone } from '@/utils/timezone';
import AppSidebar from '@/components/dashboard/AppSidebar';
import { ContextSidebar } from './ContextSidebar';
import { UnifiedSidebarToggle } from './UnifiedSidebarToggle';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { toast } from 'sonner';
import { useTutorial } from '@/contexts/TutorialContext';
import { useAuth } from '@/contexts/AuthContext';
import { MemoriesDialog } from './MemoriesDialog';
import ChatHeader from './ChatHeader';
import { ChatModeMismatchModal } from '@/components/character-creator/ChatModeMismatchModal';
import { ChatModeChangeModal } from '@/components/character-creator/ChatModeChangeModal';
import { useCharacterMemories } from '@/hooks/useCharacterMemories';
import { getChatSelectedPersona } from '@/lib/chat-persona-operations';
import { getBestPersonaForNewChat } from '@/lib/user-preferences';
import type { TrackedContext, Character } from '@/types/chat';
import { getMemoryCostExplanation } from '@/lib/memory-cost-calculator';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatQueryConfigs, chatQueryKeys } from '@/data/chats/queryKeys';
import logger from '@/utils/logger';
// import RightPanel from './RightPanel';
const RightPanelLazy = lazy(() => import('./RightPanel'));
import PersonaCreateModal from './PersonaCreateModal';
import PersonaEditModal from './PersonaEditModal';
import { useWorldInfoSelection } from '@/hooks/chat/useWorldInfoSelection';
import { usePersonaManager, personaKeys } from '@/hooks/chat/usePersonaManager';
import { createChat } from '@/lib/chat-operations';
import { createMemory as createMemoryOp } from '@/lib/memory-operations';
import { buildGreetingVariants } from '@/lib/greeting-utils';

// ChatLayout component
interface ChatLayoutProps {
  character: Character;
  children: React.ReactNode;
  currentChatId?: string;
  trackedContext?: TrackedContext;
  onContextUpdate?: (context: TrackedContext) => void;
  onPersonaChange?: (personaId: string | null) => void;
  onWorldInfoChange?: (worldInfoId: string | null) => void;
  characterDetails?: any; // pre-fetched character details to avoid refetch
  creditsBalanceOverride?: number; // provided by page to avoid duplicate /credits queries
  globalSettingsOverride?: any; // provided by page to avoid duplicate global settings fetch
}

export const ChatLayout = ({ character, children, currentChatId, trackedContext, onContextUpdate, onPersonaChange, onWorldInfoChange, characterDetails: characterDetailsOverride, creditsBalanceOverride, globalSettingsOverride }: ChatLayoutProps) => {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
    // Sidebar state
  const [sidebarView, setSidebarView] = useState<'navigation' | 'context'>('navigation');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
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

  // Auth
  const { user: currentUser } = useAuth();

  // Credits (skip if provided by parent)
  const { data: internalCreditsBalance = 0 } = useQuery({
    ...chatQueryConfigs.userCredits(currentUser?.id || ''),
    enabled: !!currentUser?.id && typeof creditsBalanceOverride !== 'number'
  });
  const creditsBalance = typeof creditsBalanceOverride === 'number' ? creditsBalanceOverride : internalCreditsBalance;

  // Persona manager hook
  const { personas, selectedPersona, setSelectedPersona, showCreateModal, setShowCreateModal, showEditModal, setShowEditModal, personaToEdit, setPersonaToEdit, currentPersonaDraft, setCurrentPersonaDraft, createPersona: createPersonaAsync, deletePersona: deletePersonaAsync } = usePersonaManager(currentUser?.id, currentChatId);
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);

  // Tutorial state
  const { handleStepAction, worldInfoDropdownVisible, disableInteractions, startTutorial, isActive, currentStep } = useTutorial();
  
  // World Info hook
  const { selectedWorldInfoId, selectWorldInfo } = useWorldInfoSelection(currentUser?.id, character.id, onWorldInfoChange);
  
  // Global settings (skip duplicate fetch)
  const { data: internalGlobalSettings } = useUserGlobalChatSettings({ enabled: !globalSettingsOverride });
  const globalSettings = globalSettingsOverride || internalGlobalSettings;

  // Message count (replaces HEAD count query): derived from unified chat hook via event
  const [currentChatMessageCount, setCurrentChatMessageCount] = useState(0);
  const messageCountLoading = false; // no network loading now
  useEffect(() => {
    const handler = (e: any) => {
      if (!e?.detail) return;
      if (e.detail.chatId === currentChatId) {
        setCurrentChatMessageCount(e.detail.count || 0);
      }
    };
    window.addEventListener('chat-messages-updated', handler);
    return () => window.removeEventListener('chat-messages-updated', handler);
  }, [currentChatId]);
  
  // Memories Dialog state
  const [showMemoriesDialog, setShowMemoriesDialog] = useState(false);
  const { memories, loading: memoriesLoading, error: memoriesError, refreshMemories, fetchMemories } = useCharacterMemories(
    character.id,
    currentUser?.id
  );
  
  // Chat mode state
  const [chatMode, setChatMode] = useState<'storytelling' | 'companion'>('storytelling');
  const [chatModeLoading, setChatModeLoading] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingChatMode, setPendingChatMode] = useState<'storytelling' | 'companion' | null>(null);
  const [currentChat, setCurrentChat] = useState<any>(null);
  
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
  const characterDetailsQuery = useQuery({
    ...chatQueryConfigs.characterDetails(character.id),
    enabled: !characterDetailsOverride, // skip if provided by parent
  });
  const characterDetails = useMemo(() => {
    if (characterDetailsOverride) return characterDetailsOverride;
    const d: any = characterDetailsQuery.data;
    return d?.data ?? d ?? null;
  }, [characterDetailsOverride, characterDetailsQuery.data]);

  // User chats
  const { data: chats = [], isLoading: chatsLoading } = useQuery({
    queryKey: ['user', 'chats', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [] as any[];
      const { data } = await Chats.getUserChatsPaginated(currentUser.id, 1, 50);
      return data || [];
    },
    enabled: !!currentUser?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const filteredChatHistory = useMemo(() => {
    const base = chats || [];
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((chat: any) =>
      chat.character?.name?.toLowerCase().includes(q) ||
      chat.title?.toLowerCase().includes(q)
    );
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
  const userCharSettingsQuery = useQuery({
    queryKey: ['user', 'character-settings', currentUser?.id, character.id],
    queryFn: async () => currentUser ? CharacterUserSettings.getUserCharacterSettings(currentUser.id, character.id) : null,
    enabled: !!currentUser?.id,
  });
  useEffect(() => {
    const settings: any = userCharSettingsQuery.data;
    if (settings) {
      setChatMode(settings.chat_mode);
      setTimeAwarenessEnabled(settings.time_awareness_enabled || false);
    }
  }, [userCharSettingsQuery.data]);

  // Current chat metadata
  const currentChatModeQuery = useQuery({
    queryKey: ['chat', 'mode', currentChatId, currentUser?.id],
    queryFn: async () => {
      if (!currentChatId || !currentUser?.id) return null;
      const { data } = await Chats.getChatMode(currentChatId, currentUser.id);
      return data;
    },
    enabled: !!currentChatId && !!currentUser?.id,
  });
  useEffect(() => {
    const chatData: any = currentChatModeQuery.data;
    if (chatData) setCurrentChat(chatData);
    const settings: any = userCharSettingsQuery.data;
    if (chatData?.chat_mode && settings?.chat_mode && chatData.chat_mode !== settings.chat_mode) {
      setShowMismatchModal(true);
    }
  }, [currentChatModeQuery.data, userCharSettingsQuery.data]);

  // Notify parent when persona changes (from hook)
  useEffect(() => {
    if (onPersonaChange) {
      logger.debug('🎭 ChatLayout: Notifying parent of persona change:', selectedPersona?.id);
      onPersonaChange(selectedPersona?.id || null);
    }
  }, [selectedPersona, onPersonaChange]);

  // Reload persona data for current chat -> invalidate selected query
  const handlePersonaSaved = async () => {
    if (!currentChatId || !currentUser) return;
    logger.debug('🔄 Reloading persona data after save for chat:', currentChatId);
    queryClient.invalidateQueries({ queryKey: personaKeys.chatSelected(currentChatId) });
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
    } catch (error) {
      logger.error('Error updating like status:', error);
    }
  };

  const handleFavorite = async () => {
    if (!currentUser) return;
    try {
      const newState = await CharacterInteractions.toggleCharacterFavorite(character.id, currentUser.id);
      setIsFavorited(newState);
      queryClient.invalidateQueries({ queryKey: ['character', 'favorited', currentUser?.id, character.id] });
    } catch (error) {
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
  }, [isActive, currentStep]);

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
      reader.onload = (e) => {
        setCurrentPersonaDraft(prev => ({
          ...prev,
          avatar_url: e.target?.result as string
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
      setSelectedPersona(newPersona as Persona);
      setShowCreateModal(false);
      toast.success('Persona created successfully!');
    } catch (error) {
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
    } catch (error) {
      logger.error('Error removing persona:', error);
      toast.error('Failed to remove persona');
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!currentUser) return;

    // Optimistically remove from chat history cache
    queryClient.setQueryData(['user', 'chats', currentUser.id], (old: any[] | undefined) => {
      if (!old) return old;
      return old.filter((c: any) => c.id !== chatId);
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error: any) {
      logger.error('Error creating memory:', error);
      toast.error('Failed to create memory', { description: error.message || 'Please try again later.' });
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
          logger.warn('Context fetch skipped/failed:', error.message || error.toString());
          return;
        }
        if (data?.current_context) {
          const raw = data.current_context as any;
          const converted = {
            moodTracking: raw?.mood || 'No context',
            clothingInventory: raw?.clothing || 'No context',
            locationTracking: raw?.location || 'No context',
            timeAndWeather: raw?.time_weather || 'No context',
            relationshipStatus: raw?.relationship || 'No context',
            characterPosition: raw?.character_position || 'No context',
            enchantmentStatus: raw?.enchantment_status || 'No context',
            itemInventory: raw?.item_inventory || 'No context'
          };
          if (onContextUpdate) onContextUpdate(converted);
        }
      } catch (e:any) {
        logger.error('Failed to fetch initial context:', e);
      }
    };
    fetchInitialContext();
  }, [currentChatId, currentUser?.id, character?.id, onContextUpdate]);

  const preChatInitialContextSeededRef = useRef(false);
  useEffect(() => {
    if (currentChatId) return; // only pre-chat
    if (preChatInitialContextSeededRef.current) return;
    if (!onContextUpdate) return;
    const def = (characterDetailsOverride || (window as any).characterDetails || {} as any).character_definitions || (character as any).character_definitions || {};
    let initialCtx: any = null;
    try {
      if (def.initial_addon_context_enabled && def.initial_addon_context && typeof def.initial_addon_context === 'object') {
        initialCtx = def.initial_addon_context;
      } else if (def.personality_summary) {
        const parsed = typeof def.personality_summary === 'string' ? JSON.parse(def.personality_summary) : def.personality_summary;
        if (parsed?.initial_addon_context_enabled && parsed?.initial_addon_context && typeof parsed.initial_addon_context === 'object') {
          initialCtx = parsed.initial_addon_context;
        }
      }
    } catch { /* swallow */ }
    if (!initialCtx) return;
    const pick = (k: string) => {
      const v = initialCtx[k];
      return (typeof v === 'string' && v.trim()) ? v.trim() : 'No context';
    };
    const mapped: TrackedContext = {
      moodTracking: pick('mood'),
      clothingInventory: pick('clothing'),
      locationTracking: pick('location'),
      timeAndWeather: pick('time_weather'),
      relationshipStatus: pick('relationship'),
      characterPosition: pick('character_position'),
      enchantmentStatus: pick('enchantment_status'),
      itemInventory: pick('item_inventory')
    };
    // If all are 'No context', skip
    const anyValue = Object.values(mapped).some(v => v && v !== 'No context');
    if (!anyValue) return;
    preChatInitialContextSeededRef.current = true;
    try { onContextUpdate(mapped); } catch {}
  }, [currentChatId, onContextUpdate, characterDetailsOverride, character]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen-stable md:h-full bg-[#121212] relative overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden">
        <MobileHeader 
          title="Chat" 
          userCredits={creditsBalance}
          username={currentUser?.email?.split('@')[0] || 'User'}
        />
      </div>

      {/* Desktop Sidebar - Fixed Position */}
      <div className={`hidden md:block fixed left-0 top-0 h-full z-40 transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}>
        {sidebarView === 'navigation' ? (
          <AppSidebar 
            sidebarMode={sidebarView}
            onToggleMode={handleSidebarModeToggle}
            contextCount={contextCount}
            userCreditsOverride={creditsBalance}
          />
        ) : (
          <ContextSidebar
            context={trackedContext}
            currentContext={trackedContext}
            addonSettings={globalSettings}
            character={character}
            onBackToNav={() => setSidebarView('navigation')}
            onOpenSettings={() => {
              setRightPanelOpen(true);
            }}
          />
        )}
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col h-full relative transition-all duration-300 ${
        sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
      }`}>
        <ChatHeader
          character={character}
          characterDetails={characterDetails}
          creditsBalance={creditsBalance}
          currentUser={currentUser}
            isCreatingMemory={isCreatingMemory}
          currentChatId={currentChatId}
          onConfirmCreateMemory={handleCreateMemory}
          onToggleRightPanel={handleRightPanelToggle}
          isTutorialActive={isActive}
          currentStep={currentStep}
          startTutorial={startTutorial}
          isMessageCountLoading={messageCountLoading}
          messageCount={currentChatMessageCount}
          getMemoryCostText={getMemoryCostExplanation}
        />
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
          onSelectChat={(characterId: string, chatId: string) => { if (chatId !== currentChatId) navigate(`/chat/${characterId}/${chatId}`); }}
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