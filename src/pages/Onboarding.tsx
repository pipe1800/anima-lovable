import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import VibeSelection from '@/components/onboarding/VibeSelection';
import ProfileSetup from '@/components/onboarding/ProfileSetup';
import PersonaCreation from '@/components/onboarding/PersonaCreation';
import WelcomeModal from '@/components/WelcomeModal';
import CharacterSelection from '@/components/onboarding/CharacterSelection';
import OnboardingProgressBar from '@/components/onboarding/OnboardingProgressBar';

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for existing session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('Onboarding session check:', session?.user?.email);
      if (session?.user) {
        setUser(session.user);
        
        // Check if user has completed onboarding
        const isCompleted = session.user.user_metadata?.onboarding_completed;
        console.log('Onboarding completed status:', isCompleted);
        
        if (isCompleted) {
          // User already completed onboarding, redirect to discover
          setOnboardingCompleted(true);
          navigate('/discover');
        } else {
          // New user, go directly to first onboarding step
          setCurrentStep(0);
        }
      } else {
        // No user, redirect to auth
        navigate('/auth');
      }
      setLoading(false);
    });

    // Then set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Onboarding auth change:', event, session?.user?.email);
        if (session?.user) {
          setUser(session.user);
          
          // Check onboarding status for new sessions
          const isCompleted = session.user.user_metadata?.onboarding_completed;
          if (isCompleted && !onboardingCompleted) {
            navigate('/discover');
          }
        } else if (!loading && event !== 'INITIAL_SESSION') {
          navigate('/auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, loading, onboardingCompleted]);

  const handleWelcomeClose = () => {
    setShowWelcome(false);
  };

  const handleBeginQuest = () => {
    console.log('Begin Quest clicked - closing modal and starting onboarding');
    setShowWelcome(false);
    // Start the onboarding flow immediately
  };

  const handleNext = () => {
    if (currentStep === 0 && selectedVibes.length === 0) return;
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleProfileComplete = () => {
    setCurrentStep(2);
  };

  const handleSkipProfile = () => {
    setCurrentStep(2);
  };

  const handlePersonaComplete = () => {
    setCurrentStep(3);
  };

  const handleSkipPersona = () => {
    setCurrentStep(3);
  };

  const handleCharacterSelect = async (character: any) => {
    console.log('Selected character:', character);
    await completeOnboarding();
    // Navigate to chat with selected character and replace history to prevent back navigation
    navigate('/chat', { state: { selectedCharacter: character }, replace: true });
  };

  const handleSkipCharacter = async () => {
    console.log('Skipping character selection');
    await completeOnboarding();
    // Navigate to discover and replace history to prevent back navigation
    navigate('/discover', { replace: true });
  };

  const completeOnboarding = async () => {
    // Mark onboarding as completed
    if (user) {
      await supabase.auth.updateUser({
        data: { onboarding_completed: true }
      });
      
      // Also update the profiles table
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Redirecting to authentication...</div>
      </div>
    );
  }

  // If onboarding is completed, redirect to dashboard
  if (onboardingCompleted) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Redirecting to dashboard...</div>
      </div>
    );
  }

  const username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';

  const getCanGoNext = () => {
    if (currentStep === 0) return selectedVibes.length > 0;
    if (currentStep === 3) return false; // Disable next button on character selection step
    return true;
  };

  return (
    <div className="min-h-screen bg-[#121212] flex flex-col">
      {/* Progress Bar */}
      {!showWelcome && (
        <OnboardingProgressBar
          currentStep={currentStep}
          totalSteps={4}
          onNext={handleNext}
          onBack={handleBack}
          canGoNext={getCanGoNext()}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-x-hidden">
        {!showWelcome && currentStep === 0 && (
          <VibeSelection 
            selectedVibes={selectedVibes}
            setSelectedVibes={setSelectedVibes}
          />
        )}
        
        {!showWelcome && currentStep === 1 && (
          <ProfileSetup
            onComplete={handleProfileComplete}
            onSkip={handleSkipProfile}
          />
        )}

        {!showWelcome && currentStep === 2 && (
          <PersonaCreation
            onComplete={handlePersonaComplete}
            onSkip={handleSkipPersona}
          />
        )}

        {!showWelcome && currentStep === 3 && (
          <CharacterSelection
            selectedVibes={selectedVibes}
            onCharacterSelect={handleCharacterSelect}
            onSkip={handleSkipCharacter}
          />
        )}
      </div>
    </div>
  );
};

export default Onboarding;
