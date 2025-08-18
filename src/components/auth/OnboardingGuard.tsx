import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface OnboardingGuardProps {
  children: React.ReactNode;
  requireOnboardingComplete?: boolean;
}

const OnboardingGuard = ({ children, requireOnboardingComplete = false }: OnboardingGuardProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  const isCompleted = user.user_metadata?.onboarding_completed;

  if (location.pathname === '/onboarding' && isCompleted) {
    navigate('/dashboard');
    return null;
  }

  if (requireOnboardingComplete && !isCompleted && location.pathname !== '/onboarding') {
    navigate('/onboarding');
    return null;
  }

  return <>{children}</>;
};

export default OnboardingGuard;