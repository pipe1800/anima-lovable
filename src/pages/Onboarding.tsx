import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import VibeSelection from '@/components/onboarding/VibeSelection';
import ProfileSetup from '@/components/onboarding/ProfileSetup';
import PersonaCreation from '@/components/onboarding/PersonaCreation';
import CharacterSelection from '@/components/onboarding/CharacterSelection';
import OnboardingProgressBar from '@/components/onboarding/OnboardingProgressBar';

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    const isCompleted = user.user_metadata?.onboarding_completed;
    if (isCompleted) { navigate('/discover'); } else { setCurrentStep(0); }
    setLoading(false);
  }, [user, navigate]);

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
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
      // Ensure avatar exists now (moved from refreshProfile)
      try {
        const { data: profileRow } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
        if (!profileRow?.avatar_url) {
          const response = await fetch('/default_avatar.jpg');
          const blob = await response.blob();
            const file = new File([blob], 'default_avatar.jpg', { type: blob.type });
            const storagePath = `${user.id}/avatar-default.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('character-avatars')
              .upload(storagePath, file, { upsert: true });
            let avatarUrlToSet: string = '/default_avatar.jpg';
            if (!uploadError && uploadData?.path) {
              const { data: pub } = await supabase.storage
                .from('character-avatars')
                .getPublicUrl(uploadData.path);
              avatarUrlToSet = pub.publicUrl || avatarUrlToSet;
            }
            await supabase.from('profiles').update({ avatar_url: avatarUrlToSet }).eq('id', user.id);
        }
      } catch (e) { console.error('Failed default avatar ensure:', e); }
    }
    setOnboardingCompleted(true);
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
