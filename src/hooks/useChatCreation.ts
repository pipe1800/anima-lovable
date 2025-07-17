import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Character {
  id: string;
  name: string;
  avatar_url?: string | null;
  short_description?: string | null;
}

export const useChatCreation = () => {
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();

  const createChatWithGreeting = async (character: Character, retryCount = 0): Promise<string | null> => {
    if (!user || !session) {
      throw new Error('Authentication required');
    }

    try {
      console.log(`🚀 Creating chat with ${character.name} (attempt ${retryCount + 1})`);
      
      const { data, error } = await supabase.functions.invoke('create-chat-with-greeting', {
        body: {
          character_id: character.id,
          character_name: character.name
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to create chat');
      }

      if (!data?.success || !data?.chat_id) {
        throw new Error('Invalid response from chat creation');
      }

      console.log(`✅ Chat created successfully: ${data.chat_id}`);
      return data.chat_id;
    } catch (error: any) {
      console.error(`❌ Chat creation failed (attempt ${retryCount + 1}):`, error);
      
      // Retry logic for network/temporary errors
      if (retryCount < 2 && (
        error.message?.includes('fetch') || 
        error.message?.includes('network') ||
        error.message?.includes('timeout')
      )) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s exponential backoff
        console.log(`⏳ Retrying chat creation in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return createChatWithGreeting(character, retryCount + 1);
      }
      
      throw error;
    }
  };

  const startChat = async (character: Character) => {
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

      // Create chat with greeting
      const chatId = await createChatWithGreeting(character);
      
      if (chatId) {
        // Success toast
        toast({
          title: "Chat Created",
          description: `Ready to chat with ${character.name}!`,
        });

        // Navigate with proper state
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
      
      // Show error toast
      toast({
        title: "Chat Creation Failed",
        description: error.message || "Failed to start chat. Please try again.",
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