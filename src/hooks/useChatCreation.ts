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

  const startChat = async (character: Character, options?: { personaId?: string | null; worldInfoId?: string | null }) => {
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
      // Simple navigation - let the Chat page handle chat creation
      navigate(`/chat/${character.id}`, {
        state: {
          selectedCharacter: character,
          selectedPersonaId: options?.personaId || null,
          selectedWorldInfoId: options?.worldInfoId || null,
          deferred: true
        }
      });
    } catch (error) {
      console.error('❌ Start chat navigation failed:', error);
      toast({ title: 'Navigation Failed', description: 'Unable to open chat.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  return {
    startChat,
    isCreating
  };
};