import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { handleChatError } from '@/utils/chatErrorHandling';
import { getUserCharacterAddonSettings } from '@/lib/user-addon-operations';
import type { Character } from '@/types/chat';

export const useChatCreation = () => {
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();

  const createBasicChat = async (character: Character, addonSettings: any, retryCount = 0): Promise<{ chatId: string; addonSettings: any } | null> => {
    if (!user || !session) {
      throw new Error('Authentication required');
    }

    try {
      console.log(`🚀 Creating basic chat with ${character.name} (attempt ${retryCount + 1})`);
      console.log(`🔍 Basic chat creation request:`, { characterId: character.id, userId: user.id });
      
      const { data, error } = await supabase.functions.invoke('create-basic-chat', {
        body: {
          character_id: character.id,
          character_name: character.name,
          addonSettings: addonSettings
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to create basic chat');
      }

      if (!data?.success || !data?.chat_id) {
        throw new Error('Invalid response from basic chat creation');
      }

      console.log(`✅ Basic chat created successfully: ${data.chat_id}`);
      return { 
        chatId: data.chat_id, 
        addonSettings: data.addon_settings || addonSettings 
      };
    } catch (error: any) {
      console.error(`❌ Basic chat creation failed (attempt ${retryCount + 1}):`, error);
      
      // Retry logic for network/temporary errors
      if (retryCount < 2 && (
        error.message?.includes('fetch') || 
        error.message?.includes('network') ||
        error.message?.includes('timeout')
      )) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s exponential backoff
        console.log(`⏳ Retrying basic chat creation in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return createBasicChat(character, addonSettings, retryCount + 1);
      }
      
      throw error;
    }
  };

  const extractChatContext = async (chatId: string, characterId: string, addonSettings: any) => {
    try {
      console.log(`🧠 Starting background context extraction for chat: ${chatId}`);
      
      // Fire and forget - this runs in the background
      supabase.functions.invoke('extract-chat-context', {
        body: {
          chat_id: chatId,
          character_id: characterId,
          addon_settings: addonSettings
        }
      }).then(({ data, error }) => {
        if (error) {
          console.error('❌ Background context extraction failed:', error);
          // Show a subtle notification that context extraction failed but don't block user
          toast({
            title: "Context Processing",
            description: "Advanced context features may be limited for this chat.",
            variant: "default",
          });
        } else {
          console.log('✅ Background context extraction completed:', data);
          if (data?.success) {
            // Optional: Show success notification for context extraction
            console.log('🎉 Chat enhanced with advanced context features');
          }
        }
      });
    } catch (error) {
      console.error('❌ Error starting background context extraction:', error);
      // Don't throw - this is background processing
    }
  };

  const startChat = async (character: Character) => {
    // Prevent double-clicks and concurrent calls
    if (isCreating) {
      console.log('⏭️ Chat creation already in progress, ignoring duplicate call');
      return;
    }

    // Check authentication first
    if (!user || !session) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to start chatting with characters.",
        variant: "destructive",
      });
      navigate('/auth');
      return;
    }

    setIsCreating(true);

    try {
      // Show loading toast
      toast({
        title: "Creating Chat",
        description: `Starting conversation with ${character.name}...`,
      });

      // Get user's addon settings for this character
      const addonSettings = await getUserCharacterAddonSettings(user.id, character.id);
      console.log('📊 Addon settings for character:', addonSettings);

      // Step 1: Create basic chat quickly (fast operation)
      const result = await createBasicChat(character, addonSettings);
      
      if (result) {
        const { chatId, addonSettings: finalAddonSettings } = result;
        
        // Step 2: Start background context extraction (don't wait for it)
        extractChatContext(chatId, character.id, finalAddonSettings);

        // Success toast
        toast({
          title: "Chat Created",
          description: `Ready to chat with ${character.name}!`,
        });

        // Navigate immediately with the chat ID (no waiting for context)
        navigate('/chat', {
          state: {
            selectedCharacter: character,
            existingChatId: chatId
          }
        });
      } else {
        // Fallback: navigate without chat ID
        console.log('🔄 Falling back to direct navigation');
        toast({
          title: "Chat Started",
          description: `Opening conversation with ${character.name}...`,
        });
        
        navigate('/chat', {
          state: {
            selectedCharacter: character
          }
        });
      }
    } catch (error: any) {
      console.error('❌ Start chat failed:', error);
      
      // Use standardized error handling
      const chatError = handleChatError(error, 'starting chat', false);
      
      // Show error toast
      toast({
        title: "Chat Creation Failed",
        description: chatError.message,
        variant: "destructive",
      });

      // Fallback navigation for authentication-related errors
      if (error.message?.includes('auth') || error.message?.includes('token')) {
        navigate('/auth');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return {
    startChat,
    isCreating
  };
};