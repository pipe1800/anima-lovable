import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { SidebarProvider } from '@/components/ui/sidebar';
import ChatInterface from '@/components/chat/ChatInterface';
import { ChatLayout } from '@/components/chat/ChatLayout';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import { TutorialManager } from '@/components/tutorial/TutorialManager';
import { useContextManagement } from '@/hooks/useContextManagement';
import type { TrackedContext } from '@/types/chat';

const Chat = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [characterData, setCharacterData] = useState<any>(null);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [selectedWorldInfoId, setSelectedWorldInfoId] = useState<string | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
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

  // Set localStorage flag for tutorial trigger when coming from onboarding
  useEffect(() => {
    if (fromOnboarding && user) {
      console.log('🎓 Chat: Setting fromOnboarding flag for tutorial');
      localStorage.setItem('fromOnboarding', 'true');
    }
  }, [fromOnboarding, user]);

  // Load context from database and sync with local state
  const { context: loadedContext, reloadContext, isLoading: contextLoading } = useContextManagement(
    currentChatId, 
    characterId || '', 
    user?.id || null
  );

  // Add a callback to reload context after message is sent
  const handleMessageSent = useCallback(async () => {
    if (!currentChatId || !characterId || !user?.id) return;
    
    console.log('🔄 Message sent, context will be extracted by backend');
    
    // The backend (send-message-handler) now handles context extraction
    // Real-time subscription should pick up the changes automatically
    // But we can add a small delay and force reload as backup
    setTimeout(() => {
      console.log('🔄 Triggering context reload as backup');
      reloadContext();
    }, 2000); // 2 second delay to allow backend processing
  }, [reloadContext, user?.id, characterId, currentChatId]);

  // Debug log the loaded context
  useEffect(() => {
    // Context debug information is available here if needed
  }, [loadedContext, currentChatId, characterId, user?.id, contextLoading]);

  // Sync context from database to local state when chat changes or context loads
  useEffect(() => {
    if (currentChatId && characterId && user?.id) {
      console.log('🔄 Setting tracked context from database:', loadedContext);
      setTrackedContext(loadedContext);
    }
  }, [currentChatId, characterId, user?.id, loadedContext]);

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

  // Initialize currentChatId from existingChatId
  useEffect(() => {
    if (existingChatId && !currentChatId) {
      setCurrentChatId(existingChatId);
    }
  }, [existingChatId, currentChatId]);

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
  }, [user, loading, characterId, selectedCharacter, navigate, existingChatId, chatId, currentChatId]);

    const handleFirstMessage = () => {
    setIsFirstMessage(false);
    setOnboardingCompleted(true);
    
    if (showOnboarding) {
      setTimeout(() => setShowOnboarding(false), 3000);
    }
  };

  const handlePersonaChange = (personaId: string | null) => {
    setSelectedPersonaId(personaId);
  };

  const handleWorldInfoChange = (worldInfoId: string | null) => {
    console.log('🌍 Chat.tsx: World info change received:', worldInfoId);
    setSelectedWorldInfoId(worldInfoId);
  };

  // Log world info changes
  useEffect(() => {
    console.log('🌍 Chat.tsx: selectedWorldInfoId state changed to:', selectedWorldInfoId);
  }, [selectedWorldInfoId]);

  const handleCreditsUpdate = (balance: number) => {
    setCreditsBalance(balance);
  };  const handleChatCreated = useCallback(async (chatId: string) => {
    console.log('💬 Chat page: New chat created with ID:', chatId);
    setCurrentChatId(chatId);
    
    // 🎯 EXTRACT INITIAL CONTEXT FROM CHARACTER CARD + GREETING
    console.log('🔍 Debug - Chat created context check:', {
      chatId,
      characterId: characterId,
      userId: user?.id,
      hasCharacterId: !!characterId,
      hasUserId: !!user?.id,
      willProceed: !!(characterId && user?.id)
    });
    
    if (characterId && user?.id) {
      console.log('🔄 Triggering initial context extraction for new chat...');
      
      try {
        // Get addon settings for context extraction
        console.log('📥 Fetching user global settings...');
        const { data: globalSettings, error: settingsError } = await supabase
          .from('user_global_chat_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        console.log('⚙️ Global settings result:', { globalSettings, settingsError });

        if (globalSettings) {
          const addonSettings = {
            moodTracking: globalSettings.mood_tracking,
            clothingInventory: globalSettings.clothing_inventory,
            locationTracking: globalSettings.location_tracking,
            timeAndWeather: globalSettings.time_and_weather,
            relationshipStatus: globalSettings.relationship_status,
            characterPosition: globalSettings.character_position
          };

          console.log('🎛️ Mapped addon settings:', addonSettings);

          // Call extract-addon-context in INITIAL mode for character card + greeting
          console.log('📞 Calling extract-addon-context function...');
          const { data, error } = await supabase.functions.invoke('extract-addon-context', {
            body: {
              chat_id: chatId,
              character_id: characterId,
              addon_settings: addonSettings,
              mode: 'initial' // 🎯 INITIAL MODE - extracts from character card + greeting
            }
          });

          console.log('📤 Function call result:', { data, error });

          if (error) {
            console.error('❌ Initial context extraction error:', error);
          } else if (data?.success) {
            console.log('✅ Initial context extracted for greeting message:', data.context_summary);
          } else {
            console.log('⏭️ Initial context extraction skipped or failed:', data?.message);
          }
        } else {
          console.log('⚠️ No global settings found - skipping context extraction');
        }
      } catch (error) {
        console.error('❌ Error in initial context extraction:', error);
      }
    }
  }, [characterId, user?.id]);

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
          currentChatId={currentChatId}
          trackedContext={trackedContext}
          onContextUpdate={setTrackedContext}
          onPersonaChange={handlePersonaChange}
          onWorldInfoChange={handleWorldInfoChange}
          creditsBalance={creditsBalance}
        >
          <ChatInterface
            character={character}
            onFirstMessage={handleFirstMessage}
            existingChatId={currentChatId}
            trackedContext={trackedContext}
            onContextUpdate={setTrackedContext}
            selectedPersonaId={selectedPersonaId}
            selectedWorldInfoId={selectedWorldInfoId}
            onChatCreated={handleChatCreated}
            onCreditsUpdate={handleCreditsUpdate}
            onMessageSent={handleMessageSent}
          />
        </ChatLayout>

        {/* Tutorial Manager */}
        <TutorialManager shouldStart={fromOnboarding && onboardingCompleted} />
      </div>
    </SidebarProvider>
  );
};

export default Chat;
