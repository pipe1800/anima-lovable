
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { SidebarProvider } from '@/components/ui/sidebar';
import ChatInterface from '@/components/chat/ChatInterface';
import { ChatLayout } from '@/components/chat/ChatLayout';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import { TutorialManager } from '@/components/tutorial/TutorialManager';
import type { TrackedContext } from '@/hooks/useChat';

const Chat = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [characterData, setCharacterData] = useState<any>(null);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [trackedContext, setTrackedContext] = useState<TrackedContext>({
    moodTracking: 'No context',
    clothingInventory: 'No context',
    locationTracking: 'No context',
    timeAndWeather: 'No context',
    relationshipStatus: 'No context',
    characterPosition: 'No context'
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { characterId, chatId } = useParams();
  
  const selectedCharacter = location.state?.selectedCharacter;
  const existingChatId = chatId || location.state?.existingChatId;
  const fromOnboarding = location.state?.fromOnboarding;

  // ALL useEffect hooks must be at the top, before any conditional returns
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        
        // Check if onboarding is completed
        const isCompleted = session.user.user_metadata?.onboarding_completed;
        console.log('Chat: Onboarding completed status:', isCompleted);
        
        setOnboardingCompleted(!!isCompleted);
        
        // Only show onboarding if it's NOT completed
        if (!isCompleted) {
          setShowOnboarding(true);
        }
      } else {
        navigate('/auth');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          
          // Update onboarding status from the latest session
          const isCompleted = session.user.user_metadata?.onboarding_completed;
          setOnboardingCompleted(!!isCompleted);
          
          // Hide onboarding if completed
          if (isCompleted) {
            setShowOnboarding(false);
          }
        } else if (!loading) {
          navigate('/auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, loading]);

  // Character data fetching effect - MOVED TO TOP
  useEffect(() => {
    // Skip if no user or still loading
    if (!user || loading) return;
    
    // Initialize character data from selectedCharacter if available
    if (selectedCharacter) {
      setCharacterData(selectedCharacter);
      return;
    }
    
    // If no selectedCharacter and no characterId, redirect to dashboard
    if (!characterId) {
      navigate('/dashboard');
      return;
    }
    
    // Fetch character data from the URL parameter
    const fetchCharacter = async () => {
      setCharacterLoading(true);
      try {
        const { data, error } = await supabase
          .from('characters')
          .select('*')
          .eq('id', characterId)
          .single();
        
        if (error || !data) {
          console.error('Error fetching character:', error);
          navigate('/dashboard');
          return;
        }
        
        setCharacterData(data);
      } catch (error) {
        console.error('Error fetching character:', error);
        navigate('/dashboard');
      } finally {
        setCharacterLoading(false);
      }
    };
    
    fetchCharacter();
  }, [user, loading, characterId, selectedCharacter, navigate]);

  const handleFirstMessage = async () => {
    if (isFirstMessage && !onboardingCompleted) {
      setIsFirstMessage(false);
      
      // Mark onboarding as completed in user metadata
      if (user) {
        try {
          const { error } = await supabase.auth.updateUser({
            data: { 
              onboarding_completed: true
            }
          });
          
          if (error) {
            console.error('Error updating user metadata:', error);
          } else {
            console.log('Onboarding marked as completed in handleFirstMessage');
            setOnboardingCompleted(true);
            
            // Set localStorage flag for tutorial trigger
            localStorage.setItem('justCompletedOnboarding', 'true');
            
            // Hide onboarding after completion animation
            setTimeout(() => {
              setShowOnboarding(false);
            }, 3000);
          }
        } catch (error) {
          console.error('Error completing onboarding:', error);
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Return early if no user - redirect handled by useEffect
  if (!user) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Redirecting...</div>
      </div>
    );
  }

  // Show loading while character is being fetched
  if (characterLoading || (!characterData && (selectedCharacter || characterId))) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Loading character...</div>
      </div>
    );
  }

  // If no character data available, show error
  if (!characterData) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white text-center">
          <div className="mb-4">No character selected</div>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Map avatar_url to avatar for compatibility
  const character = {
    ...characterData,
    avatar: characterData.avatar_url || characterData.avatar,
    fallback: characterData.name?.split(' ').map((n: string) => n[0]).join('') || 'C'
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        {/* Onboarding Checklist - shows completion animation */}
        {showOnboarding && !onboardingCompleted && (
          <OnboardingChecklist
            currentStep={isFirstMessage ? 2 : 3}
            isVisible={true}
            isCompleting={!isFirstMessage}
          />
        )}

        {/* Main Chat Layout */}
        <ChatLayout 
          character={character} 
          currentChatId={existingChatId}
          trackedContext={trackedContext}
          onContextUpdate={setTrackedContext}
        >
          <ChatInterface
            character={character}
            onFirstMessage={handleFirstMessage}
            existingChatId={existingChatId}
            trackedContext={trackedContext}
            onContextUpdate={setTrackedContext}
          />
        </ChatLayout>

        {/* Tutorial Manager */}
        <TutorialManager shouldStart={fromOnboarding && onboardingCompleted} />
      </div>
    </SidebarProvider>
  );
};

export default Chat;
