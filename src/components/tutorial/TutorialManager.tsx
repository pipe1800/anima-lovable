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
    console.log('TutorialManager: Effect triggered with:', { shouldStart, user: !!user });
    
    const checkTutorial = () => {
      if (!user) {
        console.log('TutorialManager: No user found');
        return;
      }

      const chatTutorialCompleted = user.user_metadata?.chat_tutorial_completed;
      const onboardingCompleted = user.user_metadata?.onboarding_completed;
      
      console.log('TutorialManager: User metadata:', {
        chatTutorialCompleted,
        onboardingCompleted,
        shouldStart
      });
      
      // Multiple trigger conditions for robustness
      const shouldShowTutorial = (
        (shouldStart && onboardingCompleted && !chatTutorialCompleted) ||
        (onboardingCompleted && !chatTutorialCompleted && !isActive) ||
        // Fallback: check localStorage for recent onboarding completion
        (localStorage.getItem('justCompletedOnboarding') === 'true' && !chatTutorialCompleted)
      );
      
      console.log('TutorialManager: Should show tutorial:', shouldShowTutorial);
      
      if (shouldShowTutorial) {
        setShowWelcomeModal(true);
        // Clear localStorage flag
        localStorage.removeItem('justCompletedOnboarding');
      }
    };

    if (user) {
      // Add delay to allow metadata to propagate
      const timer = setTimeout(checkTutorial, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldStart, user, isActive]);

  const handleStartTutorial = () => {
    setShowWelcomeModal(false);
    startTutorial();
  };

  const handleSkipTutorial = () => {
    setShowWelcomeModal(false);
    skipTutorial();
  };

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