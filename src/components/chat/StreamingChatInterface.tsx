import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { InsufficientCreditsModal } from './InsufficientCreditsModal';
import ChatMessages from './ChatMessages';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  fallback: string;
}

interface StreamingChatInterfaceProps {
  character: Character;
  onFirstMessage: () => void;
  existingChatId?: string;
}

const StreamingChatInterface = ({
  character,
  onFirstMessage,
  existingChatId
}: StreamingChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(existingChatId || null);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch credits balance
  useEffect(() => {
    if (!user) return;
    
    const fetchCredits = async () => {
      const { data } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        setCreditsBalance(data.balance);
      }
    };
    
    fetchCredits();
  }, [user]);

  // Fetch default persona
  useEffect(() => {
    if (!user) return;
    
    const fetchDefaultPersona = async () => {
      // Check if character has a default persona
      const { data: characterData } = await supabase
        .from('characters')
        .select('default_persona_id')
        .eq('id', character.id)
        .single();
      
      if (characterData?.default_persona_id) {
        setSelectedPersonaId(characterData.default_persona_id);
      } else {
        // Get user's first persona as fallback
        const { data: personas } = await supabase
          .from('personas')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        
        if (personas && personas.length > 0) {
          setSelectedPersonaId(personas[0].id);
        }
      }
    };
    
    fetchDefaultPersona();
  }, [user, character.id]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user || !currentChatId || isStreamingResponse) return;

    if (creditsBalance < 1) {
      setShowInsufficientCreditsModal(true);
      return;
    }

    const messageContent = inputValue;
    setInputValue('');
    setIsStreamingResponse(true);
    setStreamingMessage('');

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // Save user message first
      const { error: userMessageError } = await supabase
        .from('messages')
        .insert({
          chat_id: currentChatId,
          content: messageContent,
          author_id: user.id,
          is_ai_message: false,
          created_at: new Date().toISOString()
        });

      if (userMessageError) {
        console.error('Error saving user message:', userMessageError);
        throw new Error('Failed to save user message');
      }

      // Fetch addon settings for context generation
      let { data: addonSettings } = await supabase
        .from('user_character_addons')
        .select('addon_settings')
        .eq('user_id', user.id)
        .eq('character_id', character.id)
        .single();

      // If no addon settings exist, create default ones
      if (!addonSettings) {
        const defaultSettings = {
          moodTracking: true,
          clothingInventory: true,
          locationTracking: true,
          timeAndWeather: true,
          relationshipStatus: true,
          characterPosition: true
        };

        const { data: newSettings } = await supabase
          .from('user_character_addons')
          .insert({
            user_id: user.id,
            character_id: character.id,
            addon_settings: defaultSettings
          })
          .select('addon_settings')
          .single();

        addonSettings = newSettings;
      }

      // Handle streaming response
      const session = await supabase.auth.getSession();
      const streamResponse = await fetch(`https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
          chatId: currentChatId,
          message: messageContent,
          characterId: character.id,
          addonSettings: addonSettings?.addon_settings || {},
          selectedPersonaId: selectedPersonaId
        }),
        signal: abortControllerRef.current.signal
      });

      if (!streamResponse.ok) {
        throw new Error('Failed to start streaming response');
      }

      const reader = streamResponse.body?.getReader();
      const decoder = new TextDecoder();
      let streamingDisplay = '';
      let finalCleanContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              
              try {
                const parsed = JSON.parse(data);
                
                // PHASE 2: FRONTEND FINAL MESSAGE HANDLING - Handle final clean message from backend
                if (parsed.type === 'final_message') {
                  finalCleanContent = parsed.content;
                  
                  // ADDITIONAL FRONTEND VALIDATION - Never trust any content with context patterns
                  if (finalCleanContent && (finalCleanContent.includes('[CONTEXT') || 
                      finalCleanContent.includes('"mood"') || finalCleanContent.includes('"location"') ||
                      finalCleanContent.includes('"clothing"') || finalCleanContent.includes('"time_weather"') ||
                      finalCleanContent.includes('"relationship"') || finalCleanContent.includes('"character_position"'))) {
                    console.error('❌ CONTAMINATED final message detected, applying emergency stripping');
                    finalCleanContent = finalCleanContent
                      .replace(/\[CONTEXT_DATA\][\s\S]*?\[\/CONTEXT_DATA\]/g, '')
                      .replace(/\[CONTEXTDATA\][\s\S]*?\[\/CONTEXTDATA\]/g, '')
                      .replace(/\[CONTEXT_DATA\][\s\S]*$/g, '')
                      .replace(/\[CONTEXTDATA\][\s\S]*$/g, '')
                      .replace(/^[\s\S]*?\[\/CONTEXT_DATA\]/g, '')
                      .replace(/^[\s\S]*?\[\/CONTEXTDATA\]/g, '')
                      .replace(/\{[\s\S]*"mood"[\s\S]*\}/g, '')
                      .replace(/\{[\s\S]*"location"[\s\S]*\}/g, '')
                      .replace(/\{[\s\S]*"clothing"[\s\S]*\}/g, '')
                      .replace(/\{[\s\S]*"time_weather"[\s\S]*\}/g, '')
                      .replace(/\{[\s\S]*"relationship"[\s\S]*\}/g, '')
                      .replace(/\{[\s\S]*"character_position"[\s\S]*\}/g, '')
                      .replace(/\{[\s\S]*$/g, '')
                      .replace(/^[\s\S]*?\}/g, '')
                      .replace(/"[a-z_]+"\s*:[\s\S]*$/g, '')
                      .trim();
                  }
                  
                  setStreamingMessage(finalCleanContent);
                  console.log('✅ Received clean final message:', finalCleanContent.substring(0, 50) + '...');
                  continue;
                }
                
                // Handle streaming content chunks for display only
                if (parsed.choices?.[0]?.delta?.content) {
                  let streamContent = parsed.choices[0].delta.content;
                  
                  // Client-side fail-safe context stripping
                  if (streamContent.includes('[CONTEXT') || streamContent.includes('"mood"') || 
                      streamContent.includes('"location"') || streamContent.includes('"clothing"') ||
                      streamContent.includes('"time_weather"') || streamContent.includes('"relationship"') ||
                      streamContent.includes('"character_position"') || streamContent.includes('{')) {
                    streamContent = streamContent.replace(/\[CONTEXT_DATA\][\s\S]*?\[\/CONTEXT_DATA\]/g, '');
                    streamContent = streamContent.replace(/\[CONTEXT[^}]*$/g, '');
                    streamContent = streamContent.replace(/\{[\s\S]*$/g, '');
                    streamContent = streamContent.replace(/"[a-z_]+"\s*:[\s\S]*$/g, '');
                  }
                  
                  streamingDisplay += streamContent;
                  setStreamingMessage(streamingDisplay);
                }
              } catch (e) {
                console.warn('Failed to parse streaming chunk:', e);
              }
            }
          }
        }
      }

      // PHASE 2: FRONTEND FALLBACK SAFETY - NEVER use contaminated streamingDisplay
      let messageToSave = '';
      
      // PRIORITY 1: Use clean final message from backend (preferred)
      if (finalCleanContent && finalCleanContent.trim()) {
        messageToSave = finalCleanContent;
      } else {
        // PRIORITY 2: Emergency fallback - but NEVER use contaminated streamingDisplay directly
        console.error('❌ No clean final message received, applying emergency cleaning to streamingDisplay');
        messageToSave = streamingDisplay;
      }
      
      // PHASE 2: BULLETPROOF FAIL-SAFE CONTEXT STRIPPING - Multiple layers of protection
      let cleanMessage = messageToSave
        // Layer 1: Remove complete context blocks
        .replace(/\[CONTEXT_DATA\][\s\S]*?\[\/CONTEXT_DATA\]/g, '')
        .replace(/\[CONTEXTDATA\][\s\S]*?\[\/CONTEXTDATA\]/g, '')
        // Layer 2: Remove incomplete context blocks
        .replace(/\[CONTEXT_DATA\][\s\S]*$/g, '')
        .replace(/\[CONTEXTDATA\][\s\S]*$/g, '')
        .replace(/^[\s\S]*?\[\/CONTEXT_DATA\]/g, '')
        .replace(/^[\s\S]*?\[\/CONTEXTDATA\]/g, '')
        // Layer 3: Remove JSON-like context structures
        .replace(/\{[\s\S]*"mood"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"location"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"clothing"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"time_weather"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"relationship"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"character_position"[\s\S]*\}/g, '')
        // Layer 4: Remove any remaining JSON fragments
        .replace(/\{[\s\S]*$/g, '')
        .replace(/^[\s\S]*?\}/g, '')
        .replace(/"[a-z_]+"\s*:[\s\S]*$/g, '')
        .replace(/^\s*"[a-z_]+"\s*:[\s\S]*$/g, '')
        // Layer 5: Remove any remaining context artifacts
        .replace(/\[\/[A-Z_]+\][\s\S]*$/g, '')
        .replace(/^[\s\S]*?\[\/[A-Z_]+\]/g, '')
        .replace(/\[[A-Z_]+\][\s\S]*$/g, '')
        .trim();

      // PHASE 2: VALIDATION - Never save content with context patterns
      if (cleanMessage && !cleanMessage.includes('[CONTEXT') && 
          !cleanMessage.includes('"mood"') && !cleanMessage.includes('"location"') &&
          !cleanMessage.includes('"clothing"') && !cleanMessage.includes('"time_weather"') &&
          !cleanMessage.includes('"relationship"') && !cleanMessage.includes('"character_position"')) {
        const aiMessage = {
          id: crypto.randomUUID(),
          content: cleanMessage,
          author_id: user.id,
          chat_id: currentChatId,
          is_ai_message: true,
          created_at: new Date().toISOString(),
          current_context: null
        };

        const { error: insertError } = await supabase
          .from('messages')
          .insert([aiMessage]);

        if (insertError) {
          console.error('Error saving AI message:', insertError);
        } else {
          console.log('✅ GUARANTEED clean AI message saved to database:', cleanMessage.substring(0, 50) + '...');
        }

        // Update chat's last message timestamp
        await supabase
          .from('chats')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', currentChatId);
      } else {
        console.error('❌ BLOCKED: Attempted to save contaminated or empty message:', messageToSave.substring(0, 100));
        throw new Error('Message validation failed - contains context data or is empty');
      }

      // Update credits balance
      setCreditsBalance(prev => Math.max(0, prev - 1));

      // Force ChatMessages to refetch after streaming completes
      // The ChatMessages component uses real-time subscriptions and polling
      // so it should automatically update, but we log for debugging
      console.log('🔄 Streaming completed, ChatMessages should auto-refresh via real-time updates');

      onFirstMessage();
      toast({
        title: "Message sent successfully",
        description: "Response received and saved.",
      });

    } catch (error) {
      console.error('Error sending message:', error);
      
      if (error.name !== 'AbortError') {
        toast({
          title: "Error",
          description: "Something went wrong. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      setIsStreamingResponse(false);
      setStreamingMessage('');
      abortControllerRef.current = null;
    }
  };

  const handleCloseInsufficientCreditsModal = () => {
    setShowInsufficientCreditsModal(false);
  };

  return (
    <div className="flex flex-col h-full">
      <InsufficientCreditsModal
        isOpen={showInsufficientCreditsModal}
        onClose={handleCloseInsufficientCreditsModal}
        currentBalance={creditsBalance}
        onUpgrade={() => console.log('Navigate to upgrade')}
      />

      <ChatMessages 
        chatId={currentChatId} 
        character={character}
      />

      {/* Streaming indicator */}
      {isStreamingResponse && (
        <div className="px-6 pb-2">
          <div className="flex items-center space-x-2 text-primary">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm">{character.name} is responding...</span>
          </div>
        </div>
      )}

      <div className="bg-background/95 backdrop-blur-sm border-t border-border p-4 flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex space-x-3">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={`Message ${character.name}...`}
            className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            disabled={creditsBalance < 1 || isStreamingResponse}
          />
          <Button
            type="submit"
            className="px-6 py-3 rounded-xl transition-all hover:scale-105"
            disabled={!inputValue.trim() || creditsBalance < 1 || isStreamingResponse}
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
        
        <div className="mt-2 text-center">
          <p className="text-muted-foreground text-xs">
            {creditsBalance.toLocaleString()} credits remaining
          </p>
        </div>
      </div>
    </div>
  );
};

export default StreamingChatInterface;