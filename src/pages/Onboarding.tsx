import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VibeSelection from '@/components/onboarding/VibeSelection';
import ProfileSetup from '@/components/onboarding/ProfileSetup';
import PersonaCreation from '@/components/onboarding/PersonaCreation';
import CharacterSelection from '@/components/onboarding/CharacterSelection';
import OnboardingProgressBar from '@/components/onboarding/OnboardingProgressBar';
import { useAuth } from '@/contexts/AuthContext';
import { Profile as ProfileQueries } from '@/data';

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  // Gate rendering: wait for profile when user is present
  useEffect(() => {
    if (loading) return; // still bootstrapping auth

    if (!user) {
      navigate('/auth');
      return;
    }

    if (profile) {
      if (profile.onboarding_completed) {
        navigate('/discover');
      } else {
        setCurrentStep(0); // ensure start at first step
      }
    }
  }, [user, profile, loading, navigate]);

  const handleNext = () => {
    if (currentStep === 0 && selectedVibes.length === 0) return;
    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const handleProfileComplete = () => setCurrentStep(2);
  const handleSkipProfile = () => setCurrentStep(2);
  const handlePersonaComplete = () => setCurrentStep(3);
  const handleSkipPersona = () => setCurrentStep(3);

  const completeOnboarding = async () => {
    if (user?.id) {
      await ProfileQueries.completeOnboarding(user.id);
      try { await ProfileQueries.ensureUserAvatar(user.id); } catch (e) { /* silent */ }
    }
  };

  const handleCharacterSelect = async (character: any) => {
    await completeOnboarding();
    navigate(`/chat/${character.id}`, { state: { selectedCharacter: character, fromOnboarding: true, deferred: true }, replace: true });
  };

  const handleSkipCharacter = async () => {
    await completeOnboarding();
    navigate('/discover', { replace: true });
  };

  // Loading states
  if (loading || (user && !profile)) {
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

  if (profile?.onboarding_completed) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Redirecting...</div>
      </div>
    );
  }

  const username = user.user_metadata?.username || user.email?.split('@')[0] || 'User'; // retained if needed later

  const getCanGoNext = () => {
    if (currentStep === 0) return selectedVibes.length > 0;
    if (currentStep === 1) return false;
    if (currentStep === 3) return false;
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
