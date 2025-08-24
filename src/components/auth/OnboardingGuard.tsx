import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface OnboardingGuardProps {
  children: React.ReactNode;
  requireOnboardingComplete?: boolean;
}

const OnboardingGuard = ({ children, requireOnboardingComplete = false }: OnboardingGuardProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading, profileReady } = useAuth() as any;
  const isCompleted = profile?.onboarding_completed;
  const path = location.pathname;

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/auth'); return; }
    if (!profileReady) return; // still waiting for first attempt
    // Only act on onboarding status if profile object is present (avoid null -> false race)
    if (path === '/onboarding' && profile && isCompleted) { navigate('/dashboard'); return; }
    if (requireOnboardingComplete && profile && !isCompleted && path !== '/onboarding') { navigate('/onboarding'); }
  }, [loading, user, profile, isCompleted, profileReady, path, requireOnboardingComplete, navigate]);

  // Previous logic blocked whenever profile was null OR not ready, causing permanent loading if fetch failed.
  // We now block ONLY while: initial auth still loading OR we have a user but the first profile attempt not completed.
  if (loading || (user && !profileReady)) {
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

  return <>{children}</>; 
};

export default OnboardingGuard;