import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import VibeSelection from '@/components/onboarding/VibeSelection';
import ProfileSetup from '@/components/onboarding/ProfileSetup';
import PersonaCreation from '@/components/onboarding/PersonaCreation';
import CharacterSelection from '@/components/onboarding/CharacterSelection';
import OnboardingProgressBar from '@/components/onboarding/OnboardingProgressBar';
import { Auth as AuthQueries } from '@/data';

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    AuthQueries.getSession().then(async ({ data: { session } }) => {
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
    const { data: { subscription } } = AuthQueries.onAuthStateChange(
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
    navigate(`/chat/${character.id}`, { state: { selectedCharacter: character, fromOnboarding: true, deferred: true }, replace: true });
  };

  const handleSkipCharacter = async () => {
    console.log('Skipping character selection');
    await completeOnboarding();
    // Navigate to discover and replace history to prevent back navigation
    navigate('/discover', { replace: true });
  };

  const completeOnboarding = async () => {
    if (user) {
      await AuthQueries.completeOnboarding(user.id);
      try {
        await AuthQueries.ensureDefaultAvatarIfMissing(user.id);
      } catch (e) {
        console.error('Failed to ensure default avatar on onboarding complete:', e);
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
    if (currentStep === 1) return false; // Disable Next on ProfileSetup; use Save & Continue instead
    if (currentStep === 3) return false; // Disable next button on character selection step
    return true;
  };

  return (
    <div className="min-h-screen bg-[#121212] flex flex-col">
      {/* Progress Bar */}
      <OnboardingProgressBar
        currentStep={currentStep}
        totalSteps={4}
        onNext={handleNext}
        onBack={handleBack}
        canGoNext={getCanGoNext()}
      />

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-x-hidden">
        {currentStep === 0 && (
          <VibeSelection 
            selectedVibes={selectedVibes}
            setSelectedVibes={setSelectedVibes}
          />
        )}
        
        {currentStep === 1 && (
          <ProfileSetup
            onComplete={handleProfileComplete}
            onSkip={handleSkipProfile}
          />
        )}

        {currentStep === 2 && (
          <PersonaCreation
            onComplete={handlePersonaComplete}
            onSkip={handleSkipPersona}
          />
        )}

        {currentStep === 3 && (
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
