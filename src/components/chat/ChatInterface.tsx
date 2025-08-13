import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { InsufficientCreditsModal } from './InsufficientCreditsModal';
import ChatMessages from './ChatMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useChatUnified } from '@/hooks/useChatUnified';
import { useChatPerformance } from '@/hooks/useChatPerformance';
import type { TrackedContext } from '@/types/chat';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { supabase } from '@/integrations/supabase/client';
import { handleChatError } from '@/utils/chatErrorHandling';
import logger from '@/utils/logger';
import { getPersonaById, type Persona } from '@/lib/persona-operations';

// Debug components - Only load when needed
const AddonDebugPanel = lazy(() => import('@/components/debug/AddonDebugPanel').then(module => ({
  default: module.AddonDebugPanel
})));

// Loading fallback for debug components
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  fallback: string;
}

interface ChatInterfaceProps {
  character: Character;
  onFirstMessage: () => void;
  existingChatId?: string;
  trackedContext?: TrackedContext;
  onContextUpdate?: (context: TrackedContext) => void;
  selectedPersonaId?: string | null;
  selectedWorldInfoId?: string | null;
  onChatCreated?: (chatId: string) => void; // New callback for when chat is created
  onMessageSent?: () => Promise<void>; // New callback for when message is sent
}

const ChatInterface = ({
  character,
  onFirstMessage,
  existingChatId,
  trackedContext: parentTrackedContext,
  onContextUpdate,
  selectedPersonaId: propSelectedPersonaId,
  selectedWorldInfoId,
  onChatCreated,
  onMessageSent
}: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(existingChatId || null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(propSelectedPersonaId || null);
  const [selectedPersonaData, setSelectedPersonaData] = useState<Persona | null>(null);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const log = logger.scoped('ChatInterface');

  // Listen for auto-summary success events and show notification
  useEffect(() => {
    const handleAutoSummary = (event: CustomEvent) => {
      log.info('Auto-summary notification received:', event.detail);
      toast({
        title: "🧠 New Memory Added",
        description: "Conversation automatically summarized to maintain performance.",
        duration: 5000,
      });
    };

    window.addEventListener('autoSummarySuccess', handleAutoSummary as EventListener);
    
    return () => {
      window.removeEventListener('autoSummarySuccess', handleAutoSummary as EventListener);
    };
  }, [toast, log]);

  // Create chat if needed
  useEffect(() => {
    if (!currentChatId && user && character && !isCreatingChat) {
      setIsCreatingChat(true);
      
      const initializeChat = async () => {
        try {
          log.info('Creating new chat for character:', character.id);
          
          const { data, error } = await supabase.functions.invoke('chat-management', {
            body: {
              operation: 'create-basic',
              charactersData: [{
                id: character.id,
                name: character.name
              }],
              selectedPersonaId: propSelectedPersonaId
            }
          });
          
          if (error) throw error;
          
          if (data?.success && data?.chat_id) {
            log.info('Chat created successfully:', data.chat_id);
            setCurrentChatId(data.chat_id);
            // Notify parent component about the new chat ID
            onChatCreated?.(data.chat_id);
            // Update URL
            window.history.replaceState(
              null, 
              '', 
              `/chat/${character.id}/${data.chat_id}`
            );
          }
        } catch (error) {
          const chatError = handleChatError(error, 'creating chat', false);
          toast({ title: 'Error', description: chatError.message, variant: 'destructive' });
        } finally {
          setIsCreatingChat(false);
        }
      };
      
      initializeChat();
    }
  }, [currentChatId, user, character, propSelectedPersonaId, onChatCreated, isCreatingChat, log, toast]);

  // Unified chat hook
  const {
    messages,
    isTyping,
    trackedContext: unifiedTrackedContext,
    sendMessage,
    creditsBalance,
    isLoadingMessages,
    hasMore,
    isFetchingNextPage,
    fetchNextPage,
    isRealtimeConnected,
    debugInfo,
    isStreaming,
    streamingMessage
  } = useChatUnified(currentChatId, character.id);

  // Use the prop context as primary; fallback to unified hook context
  const effectiveTrackedContext = parentTrackedContext || unifiedTrackedContext;

  // ✅ FIX: Safety cleanup for stuck streaming states
  useEffect(() => {
    if (isStreaming) {
      const timeoutId = setTimeout(() => {
        log.warn('⚠️ Streaming timeout detected, clearing stuck state');
        // Force clear streaming state if it's been too long
      }, 30000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming, log]);

  // Performance monitoring
  const { updateMetrics } = useChatPerformance(currentChatId);

  // Addon settings
  const { data: globalSettings } = useUserGlobalChatSettings();
  const backgroundImage = globalSettings?.background_image_url || null;
  const currentAddonSettings = globalSettings ? {
    dynamicWorldInfo: globalSettings.dynamic_world_info,
    enhancedMemory: globalSettings.enhanced_memory,
    moodTracking: globalSettings.mood_tracking,
    clothingInventory: globalSettings.clothing_inventory,
    locationTracking: globalSettings.location_tracking,
    timeAndWeather: globalSettings.time_and_weather,
    relationshipStatus: globalSettings.relationship_status,
    characterPosition: globalSettings.character_position,
    chainOfThought: globalSettings.chain_of_thought,
    fewShotExamples: globalSettings.few_shot_examples,
  } : {
    dynamicWorldInfo: false,
    enhancedMemory: false,
    moodTracking: false,
    clothingInventory: false,
    locationTracking: false,
    timeAndWeather: false,
    relationshipStatus: false,
    characterPosition: false,
    chainOfThought: false,
    fewShotExamples: false,
  };

  // Sync tracked context with parent
  useEffect(() => {
    if (effectiveTrackedContext && onContextUpdate) {
      const hasValidParentContext = Object.values(parentTrackedContext).some(value => value !== 'No context');
      const hasValidEffectiveContext = Object.values(effectiveTrackedContext).some(value => value !== 'No context');
      
      if (!hasValidParentContext && hasValidEffectiveContext) {
        log.debug('Syncing context to parent (parent has no valid context):', {
          from: parentTrackedContext,
          to: effectiveTrackedContext
        });
        onContextUpdate(effectiveTrackedContext);
      } else if (hasValidParentContext && hasValidEffectiveContext) {
        const isContextDifferent = (
          parentTrackedContext.moodTracking !== effectiveTrackedContext.moodTracking ||
          parentTrackedContext.clothingInventory !== effectiveTrackedContext.clothingInventory ||
          parentTrackedContext.locationTracking !== effectiveTrackedContext.locationTracking ||
          parentTrackedContext.timeAndWeather !== effectiveTrackedContext.timeAndWeather ||
          parentTrackedContext.relationshipStatus !== effectiveTrackedContext.relationshipStatus ||
          parentTrackedContext.characterPosition !== effectiveTrackedContext.characterPosition
        );

        if (isContextDifferent) {
          log.debug('Syncing context to parent (contexts differ):', {
            from: parentTrackedContext,
            to: effectiveTrackedContext
          });
          onContextUpdate(effectiveTrackedContext);
        }
      }
    }
  }, [effectiveTrackedContext, parentTrackedContext, onContextUpdate, log]);

  // Initialize chat for existing chat
  useEffect(() => {
    if (existingChatId) {
      setCurrentChatId(existingChatId);
      setIsFirstMessage(false);
    }
  }, [existingChatId]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sync selected persona when prop changes
  useEffect(() => {
    if (propSelectedPersonaId !== undefined) {
      log.debug('🔄 ChatInterface: Persona prop changed to:', propSelectedPersonaId);
      setSelectedPersonaId(propSelectedPersonaId);
    }
  }, [propSelectedPersonaId, log]);

  // Fetch selected persona data (persona > profile > default precedence in chat)
  useEffect(() => {
    let active = true;
    const loadPersona = async () => {
      try {
        if (selectedPersonaId) {
          const persona = await getPersonaById(selectedPersonaId);
          if (active) setSelectedPersonaData(persona as Persona);
        } else {
          if (active) setSelectedPersonaData(null);
        }
      } catch (e) {
        if (active) setSelectedPersonaData(null);
        log.warn('Failed to load selected persona for avatar override:', e);
      }
    };
    loadPersona();
    return () => { active = false; };
  }, [selectedPersonaId, log]);

  // Send message
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user || !currentChatId) return;

    // Check if user has enough credits
    if (creditsBalance < 1) {
      setShowInsufficientCreditsModal(true);
      return;
    }

    const messageContent = inputValue;
    setInputValue('');
    const startTime = Date.now();

    try {
      await sendMessage(
        messageContent,
        currentAddonSettings,
        selectedPersonaId,
        selectedWorldInfoId,
        effectiveTrackedContext
      );

      if (onMessageSent) await onMessageSent();

      // Update metrics
      const endTime = Date.now();
      updateMetrics(endTime - startTime);

      if (isFirstMessage) {
        setIsFirstMessage(false);
        onFirstMessage();
        toast({
          title: "🏆 Achievement Unlocked: First Contact!",
          description: "You've earned 100 free credits for completing your first quest. Use them to unlock premium features!",
          duration: 5000
        });
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      updateMetrics(Date.now() - startTime, true);
      
      if (error.message?.includes('Authentication failed') || error.message?.includes('401')) {
        toast({
          title: "Authentication Error",
          description: "Your session has expired. Please refresh the page and sign in again.",
          variant: "destructive",
        });
        setTimeout(() => { window.location.reload(); }, 3000);
      } else if (error.message?.includes('Insufficient credits')) {
        setShowInsufficientCreditsModal(true);
      } else if (error.message?.includes('Server error')) {
        toast({ title: "Service Temporarily Unavailable", description: "Our servers are experiencing high load. Please try again in a moment.", variant: "destructive" });
      } else if (error.message?.includes('Chat service not found')) {
        toast({ title: "Service Unavailable", description: "The chat service is temporarily unavailable. Please try again later.", variant: "destructive" });
      } else {
        const chatError = handleChatError(error, 'sending message', false);
        toast({ title: "Error", description: chatError.message, variant: "destructive" });
      }
    }
  }, [inputValue, user, currentChatId, creditsBalance, sendMessage, currentAddonSettings, selectedPersonaId, selectedWorldInfoId, effectiveTrackedContext, isFirstMessage, onFirstMessage, toast, updateMetrics, onMessageSent]);

  const handleUpgrade = () => {
    log.info('Navigate to upgrade page');
  };

  const handleCloseInsufficientCreditsModal = () => {
    setShowInsufficientCreditsModal(false);
  };

  // Show loading state while chat is being initialized
  if (!currentChatId && !isLoadingMessages) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
          Initializing chat...
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-transparent">
      {/* Static background layer spanning entire chat area */}
      {backgroundImage && (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}
      {/* Dark overlay for readability */}
      {backgroundImage && (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      )}

      {/* Foreground content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Debug Panel - Lazy loaded for performance */}
        <Suspense fallback={<LoadingSpinner />}>
          <AddonDebugPanel characterId={character.id} userId={user?.id} chatId={currentChatId} />
        </Suspense>
        
        {/* Messages Area - Mobile Responsive */}
        <div className="flex-1 overflow-hidden">
          <ChatMessages 
            chatId={currentChatId}
            character={character}
            trackedContext={effectiveTrackedContext}
            streamingMessage={isStreaming ? streamingMessage : undefined}
            isStreaming={isStreaming}
            messages={messages}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            isLoadingMessages={isLoadingMessages}
            fetchNextPage={fetchNextPage}
            isRealtimeConnected={isRealtimeConnected}
            debugInfo={debugInfo}
            renderBackground={false}
            userAvatarUrlOverride={selectedPersonaData?.avatar_url || undefined}
          />
        </div>

        {/* Typing Indicator (thin) */}
        <div className="px-2 sm:px-3 py-1 flex items-center">
          <div 
            className={`flex items-center space-x-2 text-gray-400 transition-all duration-300 ${
              (isTyping || isStreaming) ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-xs sm:text-sm">
              {isStreaming ? `${character.name} is responding...` : `${character.name} is typing...`}
            </span>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-transparent">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 backdrop-blur-md bg-black/30 border border-white/10 rounded-xl px-3 sm:px-4 py-2 sm:py-3 shadow-lg shadow-black/30">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Message ${character.name}...`}
                className="w-full bg-transparent outline-none text-sm sm:text-base text-white placeholder-gray-300"
                disabled={isTyping || !currentChatId}
              />
            </div>
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping || !currentChatId}
              className="backdrop-blur-md bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition-colors h-auto shadow-lg shadow-black/30"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </form>
        </div>

        {/* Modals */}
        <InsufficientCreditsModal
          isOpen={showInsufficientCreditsModal}
          onClose={handleCloseInsufficientCreditsModal}
          currentBalance={creditsBalance}
          onUpgrade={handleUpgrade}
        />
      </div>
    </div>
  );
};

export default React.memo(ChatInterface);