import React, { useState, useEffect } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { TutorialWelcomeModal } from './TutorialWelcomeModal';
import { TutorialOverlay } from './TutorialOverlay';
import { useAuth } from '@/contexts/AuthContext';

interface TutorialManagerProps {
  shouldStart: boolean;
}

export const TutorialManager: React.FC<TutorialManagerProps> = ({ shouldStart }) => {
  const { user } = useAuth();
  const { isActive, startTutorial, skipTutorial } = useTutorial();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    console.log('TutorialManager: Effect triggered with:', { 
      shouldStart, 
      user: !!user,
      chatTutorialCompleted: user?.user_metadata?.chat_tutorial_completed 
    });
    
    if (!user) return;
    
    const chatTutorialCompleted = user.user_metadata?.chat_tutorial_completed;
    const fromOnboarding = shouldStart || localStorage.getItem('fromOnboarding') === 'true';
    
    // Show tutorial if coming from onboarding and not completed
    if (fromOnboarding && !chatTutorialCompleted) {
      console.log('TutorialManager: Starting tutorial');
      setShowWelcomeModal(true);
      localStorage.removeItem('fromOnboarding');
    }
  }, [shouldStart, user]);

  const handleStartTutorial = () => {
    console.log('TutorialManager: Starting tutorial from welcome modal');
    setShowWelcomeModal(false);
    startTutorial();
  };

  const handleSkipTutorial = () => {
    console.log('TutorialManager: Skipping tutorial');
    setShowWelcomeModal(false);
    skipTutorial();
  };

  console.log('TutorialManager: Rendering with isActive:', isActive, 'showWelcomeModal:', showWelcomeModal);

  return (
    <>
      <TutorialWelcomeModal
        isOpen={showWelcomeModal}
        onStart={handleStartTutorial}
        onSkip={handleSkipTutorial}
      />
      
      {/* Use the correct TutorialOverlay */}
      {isActive && <TutorialOverlay />}
    </>
  );
};