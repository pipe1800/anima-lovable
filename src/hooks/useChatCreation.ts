import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Character } from '@/types/chat';

export const useChatCreation = () => {
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const startChat = async (character: Character) => {
    // Prevent double-clicks and concurrent calls
    if (isCreating) {
      console.log('⏭️ Chat creation already in progress, ignoring duplicate call');
      return;
    }

    // Check authentication first
    if (!user) {
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
        title: "Starting Chat",
        description: `Opening conversation with ${character.name}...`,
      });

      // Simple navigation - let the Chat page handle chat creation
      navigate('/chat', {
        state: {
          selectedCharacter: character
        }
      });
    } catch (error: any) {
      console.error('❌ Start chat failed:', error);
      
      // Show error toast
      toast({
        title: "Navigation Failed",
        description: "Unable to start chat. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return {
    startChat,
    isCreating
  };
};