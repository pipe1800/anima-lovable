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
import { getBestPersonaForNewChat } from '@/lib/user-preferences';
import { handleChatError } from '@/utils/chatErrorHandling';
import { useQueryClient } from '@tanstack/react-query';

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
  onCreditsUpdate?: (balance: number) => void; // New callback for credits balance updates
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
  onCreditsUpdate,
  onMessageSent
}: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(existingChatId || null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(propSelectedPersonaId || null);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Listen for auto-summary success events and show notification
  useEffect(() => {
    const handleAutoSummary = (event: CustomEvent) => {
      console.log('✅ Auto-summary notification received:', event.detail);
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
  }, [toast]);

  // Create chat if needed
  useEffect(() => {
    if (!currentChatId && user && character && !isCreatingChat) {
      setIsCreatingChat(true);
      
      const initializeChat = async () => {
        try {
          console.log('🎯 ChatInterface: Creating new chat for character:', character.id);
          
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
            console.log('✅ ChatInterface: Chat created successfully:', data.chat_id);
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
          console.error('Error creating chat:', error);
          toast({
            title: "Error",
            description: "Failed to create chat session",
            variant: "destructive"
          });
        } finally {
          setIsCreatingChat(false);
        }
      };
      
      initializeChat();
    }
  }, [currentChatId, user, character, propSelectedPersonaId, onChatCreated, isCreatingChat]);

  // Use new orchestrator hook
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
  } = useChatUnified(currentChatId, character.id); // ✅ PHASE 2: Single unified hook

  // Use the prop context (from useContextManagement) as the primary source
  // Fall back to unified hook context if prop context is not available
  const effectiveTrackedContext = parentTrackedContext || unifiedTrackedContext;
  
  // Debug log to show which context is being used
  useEffect(() => {
    // Context selection debug information is available here if needed
  }, [parentTrackedContext, unifiedTrackedContext, effectiveTrackedContext]);

  // ✅ FIX: Safety cleanup for stuck streaming states
  useEffect(() => {
    if (isStreaming) {
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Streaming timeout detected, clearing stuck state');
        // Force clear streaming state if it's been too long
      }, 30000); // 30 second timeout
      
      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming]);

  // Use performance monitoring
  const { metrics, updateMetrics } = useChatPerformance(currentChatId);

  // Use addon settings hook for real-time updates
  const { data: globalSettings } = useUserGlobalChatSettings();
  
  // Fallback to default settings if loading
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

  // Sync tracked context with parent - only sync when there are meaningful differences
  useEffect(() => {
    if (effectiveTrackedContext && onContextUpdate) {
      // Check if contexts have meaningful differences (ignore "No context" values)
      const hasValidParentContext = Object.values(parentTrackedContext).some(value => value !== 'No context');
      const hasValidEffectiveContext = Object.values(effectiveTrackedContext).some(value => value !== 'No context');
      
      // Only sync if the effective context has valid content and parent doesn't, 
      // or if there are actual differences in valid content
      if (!hasValidParentContext && hasValidEffectiveContext) {
        console.log('🔄 Syncing context from orchestrator to parent (parent has no valid context):', {
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
          console.log('🔄 Syncing context from orchestrator to parent (contexts differ):', {
            from: parentTrackedContext,
            to: effectiveTrackedContext
          });
          onContextUpdate(effectiveTrackedContext);
        }
      }
    }
  }, [effectiveTrackedContext, parentTrackedContext, onContextUpdate]);

  // Update parent with credits balance whenever it changes
  useEffect(() => {
    if (onCreditsUpdate && typeof creditsBalance === 'number') {
      onCreditsUpdate(creditsBalance);
    }
  }, [creditsBalance, onCreditsUpdate]);

  // Initialize chat for existing chat
  useEffect(() => {
    if (existingChatId) {
      setCurrentChatId(existingChatId);
      setIsFirstMessage(false);
      
      // Single invalidation for greeting messages with longer delay
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages', existingChatId] 
        });
      }, 1000); // Single invalidation with 1s delay
    }
  }, [existingChatId, queryClient]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Sync selected persona when prop changes
  useEffect(() => {
    if (propSelectedPersonaId !== undefined) {
      console.log('🔄 ChatInterface: Persona prop changed to:', propSelectedPersonaId);
      setSelectedPersonaId(propSelectedPersonaId);
    }
  }, [propSelectedPersonaId]);

  // Fetch user's best persona for template replacement (only if no persona prop provided)
  useEffect(() => {
    if (!user || propSelectedPersonaId !== undefined) return;
    
    const fetchBestPersona = async () => {
      const bestPersonaId = await getBestPersonaForNewChat(user.id);
      if (bestPersonaId) {
        setSelectedPersonaId(bestPersonaId);
      }
    };
    
    fetchBestPersona();
  }, [user]);

  // Memoize send handler
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
        effectiveTrackedContext // Pass the database context
      );

      // Call the parent's callback to reload context
      if (onMessageSent) {
        await onMessageSent();
      }

      // Update metrics
      const endTime = Date.now();
      updateMetrics(endTime - startTime);

      // Handle first message achievement if needed
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
      
      // Handle specific error types with better messaging
      if (error.message?.includes('Authentication failed') || error.message?.includes('401')) {
        toast({
          title: "Authentication Error",
          description: "Your session has expired. Please refresh the page and sign in again.",
          variant: "destructive",
        });
        
        // Auto-refresh after a delay
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else if (error.message?.includes('Insufficient credits')) {
        setShowInsufficientCreditsModal(true);
      } else if (error.message?.includes('Server error')) {
        toast({
          title: "Service Temporarily Unavailable", 
          description: "Our servers are experiencing high load. Please try again in a moment.",
          variant: "destructive"
        });
      } else if (error.message?.includes('Chat service not found')) {
        toast({
          title: "Service Unavailable",
          description: "The chat service is temporarily unavailable. Please try again later.",
          variant: "destructive"
        });
      } else {
        const chatError = handleChatError(error, 'sending message', false);
        toast({
          title: "Error",
          description: chatError.message,
          variant: "destructive"
        });
      }
    }
  }, [inputValue, user, currentChatId, creditsBalance, sendMessage, currentAddonSettings, selectedPersonaId, isFirstMessage, onFirstMessage, toast, updateMetrics, onMessageSent]);

  const handleUpgrade = () => {
    // Navigate to upgrade page or show upgrade modal
    console.log('Navigate to upgrade page');
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
    <div className="flex flex-col h-full">
      {/* Debug Panel - Lazy loaded for performance */}
      <Suspense fallback={<LoadingSpinner />}>
        <AddonDebugPanel characterId={character.id} userId={user?.id} chatId={currentChatId} />
      </Suspense>
      
      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={showInsufficientCreditsModal}
        onClose={handleCloseInsufficientCreditsModal}
        currentBalance={creditsBalance}
        onUpgrade={handleUpgrade}
      />
      
      {/* Messages Area - Simplified without frontend streaming */}
      <ChatMessages 
        chatId={currentChatId}
        character={character}
        trackedContext={effectiveTrackedContext}
        streamingMessage="" 
        isStreaming={isStreaming}
        messages={messages}
        hasMore={hasMore}
        isFetchingNextPage={isFetchingNextPage}
        isLoadingMessages={isLoadingMessages}
        fetchNextPage={fetchNextPage}
        isRealtimeConnected={isRealtimeConnected}
        debugInfo={debugInfo}
      />

      {/* Typing Indicator with Reserved Space */}
      <div className="px-6 pb-2 min-h-[2.5rem] flex items-center">
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
          <span className="text-sm">
            {isStreaming ? `${character.name} is responding...` : `${character.name} is typing...`}
          </span>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Message ${character.name}...`}
            className="flex-1 px-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isTyping || !currentChatId}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping || !currentChatId}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default React.memo(ChatInterface);