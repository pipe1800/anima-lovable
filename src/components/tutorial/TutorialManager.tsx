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
    if (process.env.NODE_ENV === 'development') {
      // Minimal debug once per mount/change
      console.debug('TutorialManager: effect', { shouldStart, hasUser: !!user });
    }

    if (!user) return;
    
    const chatTutorialCompleted = user.user_metadata?.chat_tutorial_completed;
    const fromOnboarding = shouldStart || localStorage.getItem('fromOnboarding') === 'true';
    
    if (fromOnboarding && !chatTutorialCompleted) {
      setShowWelcomeModal(true);
      localStorage.removeItem('fromOnboarding');
    }
  }, [shouldStart, user]);

  const handleStartTutorial = () => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('TutorialManager: start from modal');
    }
    setShowWelcomeModal(false);
    startTutorial();
  };

  const handleSkipTutorial = () => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('TutorialManager: skip from modal');
    }
    setShowWelcomeModal(false);
    skipTutorial();
  };

  // Avoid noisy render logs
  return (
    <>
      <TutorialWelcomeModal
        isOpen={showWelcomeModal}
        onStart={handleStartTutorial}
        onSkip={handleSkipTutorial}
      />
      {isActive && <TutorialOverlay />}
    </>
  );
};