import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Wand2, Zap, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { InsufficientCreditsModal } from './InsufficientCreditsModal';
import ChatMessages from './ChatMessages';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useOptimizedChat,
  useChatPerformance,
  type TrackedContext
} from '@/hooks/useOptimizedChat';
import { useAddonSettings } from './useAddonSettings';
import { supabase } from '@/integrations/supabase/client';
import PerformanceMonitor from './PerformanceMonitor';
import { DatabaseBatchOperations } from './DatabaseBatchOperations';
import { AddonDebugPanel } from '@/components/debug/AddonDebugPanel';

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
}

const ChatInterface = ({
  character,
  onFirstMessage,
  existingChatId,
  trackedContext: parentTrackedContext,
  onContextUpdate
}: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(existingChatId || null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);
  const [showDatabaseOps, setShowDatabaseOps] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Use optimized chat hook
  const {
    messages,
    isTyping,
    trackedContext,
    creditsBalance,
    characterDetails,
    isLoading,
    error,
    sendMessage,
    dispatch
  } = useOptimizedChat(currentChatId, character.id);

  // Use performance monitoring
  const { metrics, updateMetrics } = useChatPerformance(currentChatId);

  // Use addon settings hook for real-time updates
  const { data: addonSettings } = useAddonSettings(character.id);
  
  // Fallback to default settings if loading
  const currentAddonSettings = addonSettings || {
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

  // Initialize chat for existing chat
  useEffect(() => {
    if (existingChatId) {
      setCurrentChatId(existingChatId);
      setIsFirstMessage(false);
    }
  }, [existingChatId]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Fetch user's default persona for template replacement
  useEffect(() => {
    if (!user) return;
    
    const fetchUserPersona = async () => {
      const { data: personas } = await supabase
        .from('personas')
        .select('id, name')
        .eq('user_id', user.id)
        .limit(1);
      
      if (personas && personas.length > 0) {
        setSelectedPersonaId(personas[0].id);
      }
    };
    
    fetchUserPersona();
  }, [user]);

  // Addon settings are now loaded via useAddonSettings hook

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user || !currentChatId || isStreaming) return;

    // Check if user has enough credits (need at least 1 credit per message)
    if (creditsBalance < 1) {
      setShowInsufficientCreditsModal(true);
      return;
    }

    const messageContent = inputValue;
    setInputValue('');
    const startTime = Date.now();
    setIsStreaming(true);
    setStreamingMessage('');

    // Cancel any existing streaming request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // First save the user message
      const { error: userMessageError } = await supabase
        .from('messages')
        .insert({
          chat_id: currentChatId,
          content: messageContent,
          author_id: user.id,
          is_ai_message: false,
          created_at: new Date().toISOString()
        });

      if (userMessageError) throw userMessageError;

      // Start streaming AI response using supabase.functions.invoke for better reliability
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch('https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/chat-stream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: currentChatId,
          message: messageContent,
          characterId: character.id,
          addonSettings: currentAddonSettings,
          selectedPersonaId: selectedPersonaId
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Streaming failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    console.log('🏁 Stream completed, final message length:', accumulatedMessage.length);
                    break;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    
                    // Handle streaming chunks
                    if (parsed.choices?.[0]?.delta?.content) {
                      const deltaContent = parsed.choices[0].delta.content;
                      accumulatedMessage += deltaContent;
                      setStreamingMessage(accumulatedMessage);
                      console.log('📝 Streaming chunk received, total length:', accumulatedMessage.length, 'chunk:', deltaContent);
                    }
                  } catch (e) {
                    console.log('⚠️ Failed to parse streaming data:', data, e);
                  }
                }
              }
        }
      }

      // Message is already saved by the edge function, no need to save again

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

    } catch (error) {
      console.error('Error sending message:', error);
      updateMetrics(Date.now() - startTime, true);
      
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsStreaming(false);
      setStreamingMessage('');
    }
  };


  const handleUpgrade = () => {
    // Navigate to upgrade page or show upgrade modal
    console.log('Navigate to upgrade page');
  };

  const handleCloseInsufficientCreditsModal = () => {
    setShowInsufficientCreditsModal(false);
  };


  return (
    <div className="flex flex-col h-full">
      {/* Debug Panel */}
      <AddonDebugPanel characterId={character.id} userId={user?.id} />
      
      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={showInsufficientCreditsModal}
        onClose={handleCloseInsufficientCreditsModal}
        currentBalance={creditsBalance}
        onUpgrade={handleUpgrade}
      />


      {/* Messages Area */}
      <ChatMessages 
        chatId={currentChatId} 
        character={character}
        trackedContext={trackedContext}
        streamingMessage={streamingMessage}
        isStreaming={isStreaming}
      />


      {/* Typing Indicator */}
      {isTyping && !isStreaming && (
        <div className="px-6 pb-2">
          <div className="flex items-center space-x-2 text-gray-400">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm">{character.name} is typing...</span>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-[#1a1a2e] border-t border-gray-700/50 p-4 flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex space-x-3">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={`Message ${character.name}...`}
            className="flex-1 bg-[#121212] border border-gray-700/50 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF7A00] focus:border-transparent transition-all font-['Open_Sans',_sans-serif]"
            disabled={creditsBalance < 1}
          />
          <div className="flex items-center space-x-2">
            {/* Enhanced Memory indicator */}
            {currentAddonSettings.enhancedMemory && (
              <div className="flex items-center justify-center w-10 h-10 text-[#FF7A00]">
                <Wand2 className="w-5 h-5" />
              </div>
            )}
            <Button
              type="submit"
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-6 py-3 rounded-xl transition-all hover:scale-105"
              disabled={!inputValue.trim() || creditsBalance < 1 || isStreaming}
            >
              <Send className="w-5 h-5" />
            </Button>
            
            {/* Performance Monitor Toggle */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPerformanceMonitor(!showPerformanceMonitor)}
              className="hidden md:flex"
            >
              <Zap className="w-4 h-4" />
            </Button>
            
            {/* Database Operations Toggle */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDatabaseOps(!showDatabaseOps)}
              className="hidden md:flex"
            >
              <Database className="w-4 h-4" />
            </Button>
          </div>
        </form>
        
        {/* Credit balance indicator */}
        <div className="mt-2 text-center" data-tutorial="credits-display">
          <p className="text-gray-400 text-xs">
            {creditsBalance.toLocaleString()} credits remaining
          </p>
        </div>
        
      </div>
      
      {/* Performance Monitor */}
      {showPerformanceMonitor && (
        <div className="fixed bottom-4 right-4 z-50">
          <PerformanceMonitor chatId={currentChatId} isVisible={showPerformanceMonitor} />
        </div>
      )}
      
      {/* Database Batch Operations */}
      {showDatabaseOps && (
        <div className="fixed bottom-4 right-96 z-50">
          <DatabaseBatchOperations 
            chatId={currentChatId} 
            characterId={character.id}
            isVisible={showDatabaseOps} 
          />
        </div>
      )}
    </div>
  );
};

export default ChatInterface;