import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getUserChats, getCharacterDetails, deleteChat as deleteChatRpc } from '@/lib/supabase-queries';
import type { Persona } from '@/lib/persona-operations';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { getUserCharacterSettings, upsertUserCharacterSettings } from '@/queries/userCharacterSettingsQueries';
import { getBrowserTimezone } from '@/utils/timezone';
import AppSidebar from '@/components/dashboard/AppSidebar';
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
import { queryConfigs, queryKeys } from '@/queries/chatQueries';
import logger from '@/utils/logger';
// import RightPanel from './RightPanel';
const RightPanelLazy = lazy(() => import('./RightPanel'));
import PersonaCreateModal from './PersonaCreateModal';
import PersonaEditModal from './PersonaEditModal';
import { useWorldInfoSelection } from '@/hooks/chat/useWorldInfoSelection';
import { usePersonaManager, personaKeys } from '@/hooks/chat/usePersonaManager';
import { createChatWithGreeting } from '@/lib/chat-operations';
import { createMemory as createMemoryOp } from '@/lib/memory-operations';

// ChatLayout component
interface ChatLayoutProps {
  character: Character;
  children: React.ReactNode;
  currentChatId?: string;
  trackedContext?: TrackedContext;
  onContextUpdate?: (context: TrackedContext) => void;
  onPersonaChange?: (personaId: string | null) => void;
  onWorldInfoChange?: (worldInfoId: string | null) => void;
  // Optional preloaded details to prevent duplicate fetching
  characterDetails?: any;
}

export const ChatLayout = ({ character, children, currentChatId, trackedContext, onContextUpdate, onPersonaChange, onWorldInfoChange, characterDetails: characterDetailsOverride }: ChatLayoutProps) => {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  // Removed chatHistory and filteredChatHistory local state in favor of query + memo
  const [searchQuery, setSearchQuery] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const queryClient = useQueryClient();

  // Auth
  const { user: currentUser } = useAuth();

  // Fetch user credits as single source of truth
  const { data: creditsBalance = 0 } = useQuery({
    ...queryConfigs.userCredits(currentUser?.id || ''),
    enabled: !!currentUser?.id,
  });

  // Persona manager hook
  const {
    personas,
    selectedPersona,
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
  } = usePersonaManager(currentUser?.id, currentChatId);
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);

  // Tutorial state
  const { handleStepAction, worldInfoDropdownVisible, disableInteractions, startTutorial, isActive, currentStep } = useTutorial();
  
  // World Info hook
  const { selectedWorldInfoId, selectWorldInfo } = useWorldInfoSelection(currentUser?.id, character.id, onWorldInfoChange);
  
  // Enhanced Memory state
  const { data: globalSettings } = useUserGlobalChatSettings();
  const [isCreatingMemory, setIsCreatingMemory] = useState(false);
  const [currentChatMessageCount, setCurrentChatMessageCount] = useState(0);
  const { data: countedMessages = 0 as number, isLoading: messageCountLoading } = useQuery<number>({
    ...(currentChatId ? (queryConfigs as any).chatMessageCount(currentChatId) : { queryKey: ['chat', 'message-count', 'none'], queryFn: async () => 0 }),
    enabled: !!currentChatId
  });
  useEffect(() => {
    if (currentChatId) setCurrentChatMessageCount(Number(countedMessages) || 0);
    else setCurrentChatMessageCount(0);
  }, [currentChatId, countedMessages]);
  
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
    ...queryConfigs.characterDetails(character.id),
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
      const { data } = await getUserChats(currentUser.id);
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
    queryFn: async () => {
      const { data } = await supabase
        .from('character_likes')
        .select('id')
        .eq('character_id', character.id)
        .eq('user_id', currentUser!.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!currentUser?.id,
  });
  useEffect(() => setIsLiked(!!likedQuery.data), [likedQuery.data]);

  const favoritedQuery = useQuery({
    queryKey: ['character', 'favorited', currentUser?.id, character.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('character_favorites')
        .select('id')
        .eq('character_id', character.id)
        .eq('user_id', currentUser!.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!currentUser?.id,
  });
  useEffect(() => setIsFavorited(!!favoritedQuery.data), [favoritedQuery.data]);

  // User character settings
  const userCharSettingsQuery = useQuery({
    queryKey: ['user', 'character-settings', currentUser?.id, character.id],
    queryFn: async () => currentUser ? getUserCharacterSettings(currentUser.id, character.id) : null,
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
      const { data } = await supabase
        .from('chats')
        .select('chat_mode')
        .eq('id', currentChatId)
        .eq('user_id', currentUser.id)
        .single();
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
      if (isLiked) {
        await supabase
          .from('character_likes')
          .delete()
          .eq('character_id', character.id)
          .eq('user_id', currentUser.id);
        setIsLiked(false);
      } else {
        await supabase
          .from('character_likes')
          .insert([{ character_id: character.id, user_id: currentUser.id }]);
        setIsLiked(true);
      }
      queryClient.invalidateQueries({ queryKey: ['character', 'liked', currentUser?.id, character.id] });
    } catch (error) {
      logger.error('Error updating like status:', error);
    }
  };

  const handleFavorite = async () => {
    if (!currentUser) return;

    try {
      if (isFavorited) {
        await supabase
          .from('character_favorites')
          .delete()
          .eq('character_id', character.id)
          .eq('user_id', currentUser.id);
        setIsFavorited(false);
      } else {
        await supabase
          .from('character_favorites')
          .insert([{ character_id: character.id, user_id: currentUser.id }]);
        setIsFavorited(true);
      }
      queryClient.invalidateQueries({ queryKey: ['character', 'favorited', currentUser?.id, character.id] });
    } catch (error) {
      logger.error('Error updating favorite status:', error);
    }
  };

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
      const { error } = await deleteChatRpc(chatId, currentUser.id);
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
      await upsertUserCharacterSettings(currentUser.id, character.id, { chat_mode: pendingChatMode });
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
      await upsertUserCharacterSettings(currentUser.id, character.id, { time_awareness_enabled: enabled });
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

  const handleCreateNewChatForMode = async () => {
    if (!currentUser) return;
    try {
      await handleStartNewChat();
      setShowMismatchModal(false);
    } catch (error) {
      logger.error('Error creating new chat:', error);
      toast.error('Failed to create new chat');
    }
  };

  const handleChangeCharacterMode = async () => {
    if (!currentChat || !currentUser) return;
    try {
      await upsertUserCharacterSettings(currentUser.id, character.id, { chat_mode: currentChat.chat_mode });
      setChatMode(currentChat.chat_mode);
      setShowMismatchModal(false);
      toast.success(`Character mode changed to ${currentChat.chat_mode}`, {
        description: 'Mode updated to match this chat'
      });
      queryClient.invalidateQueries({ queryKey: ['user', 'character-settings', currentUser.id, character.id] });
    } catch (error) {
      logger.error('Error changing character mode:', error);
      toast.error('Failed to change character mode');
    }
  };

  // Start new chat function
  const handleStartNewChat = async () => {
    if (!currentUser || isCreatingNewChat) return;
    setIsCreatingNewChat(true);
    try {
      logger.info('🎯 ChatLayout: Creating new chat for character:', character.id);
      const { chat_id } = await createChatWithGreeting({
        characterId: character.id,
        characterName: character.name,
        selectedPersonaId: selectedPersona?.id || null,
      });
      logger.info('✅ ChatLayout: Chat created successfully:', chat_id);
      navigate(`/chat/${character.id}/${chat_id}`);
    } catch (error) {
      logger.error('Error creating new chat:', error);
      toast.error('Failed to start new chat');
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  // Enhanced Memory handler
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
        // Invalidate credits and message count after memory creation
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.messageCount(currentChatId), exact: true });
        if (currentUser?.id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.user.credits(currentUser.id), exact: true });
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

  const isCharacterOwner = currentUser && characterDetails && currentUser.id === characterDetails.creator_id;
  const loading = chatsLoading || (!characterDetailsOverride && characterDetailsQuery.isLoading);

  return (
    <div className="flex flex-col md:flex-row min-h-[100dvh] md:h-full bg-[#121212] relative overflow-hidden">
      {/* Mobile Header - Only visible on mobile */}
      <div className="md:hidden">
        <MobileHeader 
          title={`Chat with ${character.name}`}
          userCredits={creditsBalance}
          username={currentUser?.email?.split('@')[0] || 'User'}
        />
      </div>
      
      {/* Desktop Sidebar - Only visible on desktop */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>
 
       {/* Main Chat Area - Takes full width on mobile, adjusts for sidebar on desktop */}
       <div className="flex-1 flex flex-col h-full relative">
        {/* Chat Header - extracted component */}
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
 
         {/* Chat Content */}
         <div className="flex-1 overflow-hidden" style={{ pointerEvents: disableInteractions ? 'none' : 'auto' }}>
           {children}
         </div>
       </div>
 
       {/* Right Panel - Lazy */}
       <Suspense fallback={null}>
         <RightPanelLazy
           open={rightPanelOpen}
           onClose={() => setRightPanelOpen(false)}
           onConfigTabClicked={() => handleStepAction('config-tab-clicked')}
           // history props
           loading={loading}
           filteredChatHistory={filteredChatHistory}
           searchQuery={searchQuery}
           setSearchQuery={setSearchQuery}
           currentChatId={currentChatId}
           onSelectChat={(characterId: string, chatId: string) => {
             if (chatId !== currentChatId) navigate(`/chat/${characterId}/${chatId}`);
           }}
           onDeleteChat={handleDeleteChat}
           // details props
           character={character}
           characterDetails={characterDetails}
           isCharacterOwner={!!isCharacterOwner}
           onStartNewChat={handleStartNewChat}
           isCreatingNewChat={isCreatingNewChat}
           onEditCharacter={handleEditCharacter}
           showMemoriesButton={!!(globalSettings?.enhanced_memory || (isActive && currentStep === 6))}
           memoriesCount={memories.length}
           onOpenMemories={() => {
             setShowMemoriesDialog(true);
             fetchMemories();
           }}
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
           // config props
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

      {/* Persona Creation Modal - Hook-driven */}
      <PersonaCreateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        currentPersona={currentPersonaDraft}
        setCurrentPersona={setCurrentPersonaDraft}
        isCreating={isCreatingPersona}
        onCreate={handleAddPersona}
        onAvatarChange={handleAvatarChange}
      />

      {/* Edit Persona Modal - Hook-driven */}
      <PersonaEditModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        personaToEdit={personaToEdit}
        setPersonaToEdit={setPersonaToEdit}
        isSaving={isCreatingPersona}
        onSave={async () => {
          if (!personaToEdit?.name.trim()) return;
          try {
            setIsCreatingPersona(true);
            const { updatePersona } = await import('@/lib/persona-operations');
            const updatedPersona = await updatePersona(personaToEdit.id, {
              name: personaToEdit.name,
              bio: personaToEdit.bio,
              lore: personaToEdit.lore,
              avatar_url: personaToEdit.avatar_url,
            } as any);
            // Update personas list cache
            queryClient.setQueryData(personaKeys.all(currentUser?.id), (old: Persona[] = []) => old.map(p => p.id === updatedPersona.id ? updatedPersona : p));
            if (selectedPersona?.id === updatedPersona.id) {
              setSelectedPersona(updatedPersona);
            }
            setShowEditModal(false);
            setPersonaToEdit(null);
            toast.success('Persona updated successfully!');
          } catch (error) {
            logger.error('Error updating persona:', error);
            toast.error('Failed to update persona');
          } finally {
            setIsCreatingPersona(false);
          }
        }}
      />

      {/* Memories Dialog */}
      <MemoriesDialog
        open={showMemoriesDialog}
        onOpenChange={(open) => {
          setShowMemoriesDialog(open);
          if (open) fetchMemories();
        }}
        memories={memories}
        loading={memoriesLoading}
        error={memoriesError}
        characterName={character.name}
        onRefresh={() => { /* no-op, manual refresh removed */ }}
      />

      {/* Chat Mode Mismatch Modal */}
      <ChatModeMismatchModal
        isOpen={showMismatchModal}
        onClose={() => setShowMismatchModal(false)}
        chatMode={currentChat?.chat_mode || 'storytelling'}
        characterMode={chatMode}
        onCreateNewChat={handleCreateNewChatForMode}
        onChangeCharacterMode={handleChangeCharacterMode}
      />

      {/* Chat Mode Change Modal */}
      <ChatModeChangeModal
        isOpen={showChangeModal}
        onClose={() => {
          setShowChangeModal(false);
          setPendingChatMode(null);
        }}
        newMode={pendingChatMode || 'storytelling'}
        onConfirm={handleConfirmChatModeChange}
      />
    </div>
  );
};