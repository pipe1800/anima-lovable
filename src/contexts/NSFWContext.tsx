import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NSFWContextType {
  nsfwEnabled: boolean;
  isAgeVerified: boolean;
  toggleNSFW: () => void;
  verifyAge: () => Promise<boolean>;
  isLoading: boolean;
}

const NSFWContext = createContext<NSFWContextType | undefined>(undefined);

export function NSFWProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [nsfwEnabled, setNsfwEnabled] = useState(false);
  const [isAgeVerified, setIsAgeVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load NSFW preference and age verification status
  useEffect(() => {
    if (!user) {
      setNsfwEnabled(false);
      setIsAgeVerified(false);
      setIsLoading(false);
      return;
    }

    const loadNSFWSettings = async () => {
      try {
        // For now, use local storage as a temporary solution since types aren't updated
        const storedAgeVerification = localStorage.getItem(`age_verified_${user.id}`);
        const storedNSFWPref = localStorage.getItem(`nsfw_enabled_${user.id}`);
        
        setIsAgeVerified(storedAgeVerification === 'true');
        setNsfwEnabled(storedNSFWPref === 'true' && storedAgeVerification === 'true');
      } catch (error) {
        console.error('Error loading NSFW settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNSFWSettings();
  }, [user]);

  const verifyAge = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      // Store age verification in local storage temporarily
      localStorage.setItem(`age_verified_${user.id}`, 'true');
      setIsAgeVerified(true);
      
      toast({
        title: "Age Verified",
        description: "You have confirmed you are 18 or older.",
      });
      
      return true;
    } catch (error) {
      console.error('Error verifying age:', error);
      toast({
        title: "Error",
        description: "Failed to verify age. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  }, [user, toast]);

  const toggleNSFW = useCallback(async () => {
    if (!user) return;

    try {
      if (!nsfwEnabled && !isAgeVerified) {
        // Need age verification first
        toast({
          title: "Age Verification Required",
          description: "You must verify your age before enabling NSFW content.",
          variant: "destructive",
        });
        return;
      }

      const newNSFWState = !nsfwEnabled;
      
      // Store in local storage temporarily
      localStorage.setItem(`nsfw_enabled_${user.id}`, newNSFWState.toString());
      setNsfwEnabled(newNSFWState);

      toast({
        title: newNSFWState ? "NSFW Enabled" : "NSFW Disabled",
        description: newNSFWState 
          ? "NSFW content is now visible" 
          : "NSFW content is now hidden",
      });
    } catch (error) {
      console.error('Error toggling NSFW:', error);
      toast({
        title: "Error",
        description: "Failed to update NSFW preference. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, nsfwEnabled, isAgeVerified, toast]);

  const value: NSFWContextType = {
    nsfwEnabled,
    isAgeVerified,
    toggleNSFW,
    verifyAge,
    isLoading,
  };

  return (
    <NSFWContext.Provider value={value}>
      {children}
    </NSFWContext.Provider>
  );
}

export function useNSFW() {
  const context = useContext(NSFWContext);
  if (context === undefined) {
    throw new Error('useNSFW must be used within a NSFWProvider');
  }
  return context;
}
