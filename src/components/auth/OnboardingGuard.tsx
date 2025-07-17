import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

interface OnboardingGuardProps {
  children: React.ReactNode;
  requireOnboardingComplete?: boolean;
}

const OnboardingGuard = ({ children, requireOnboardingComplete = false }: OnboardingGuardProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for existing session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        checkOnboardingStatus(session.user);
      } else {
        // No user, redirect to auth
        navigate('/auth');
      }
      setLoading(false);
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          checkOnboardingStatus(session.user);
        } else if (event !== 'INITIAL_SESSION') {
          navigate('/auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  const checkOnboardingStatus = async (user: User) => {
    const isCompleted = user.user_metadata?.onboarding_completed;
    
    // If user is on onboarding page but has completed it, redirect to dashboard
    if (location.pathname === '/onboarding' && isCompleted) {
      navigate('/dashboard');
      return;
    }

    // If user is NOT on onboarding page and requires completion but hasn't completed it
    if (requireOnboardingComplete && !isCompleted && location.pathname !== '/onboarding') {
      navigate('/onboarding');
      return;
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

  return <>{children}</>;
};

export default OnboardingGuard;