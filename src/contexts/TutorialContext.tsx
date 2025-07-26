import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  target: string | null;
  action?: 'click' | 'toggle' | 'save' | 'select' | 'none';
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  requiredInteraction?: boolean;
  forceOpen?: string; // Element to force open (like dropdown)
  scrollTo?: boolean; // Whether to scroll to element
}

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  currentStepData: TutorialStep | null;
  highlightedElement: string | null;
  tutorialSteps: TutorialStep[];
  startTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  setHighlight: (element: string | null) => void;
  handleStepAction: (action: string) => void;
  isStepCompleted: (stepId: number) => boolean;
  markStepCompleted: (stepId: number) => void;
  addonDropdownOpen: boolean;
  setAddonDropdownOpen: (open: boolean) => void;
  worldInfoDropdownVisible: boolean;
  setWorldInfoDropdownVisible: (visible: boolean) => void;
  disableInteractions: boolean;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 1,
    title: 'Welcome to Your First Chat!',
    description: 'Let\'s take a quick tour to help you get the most out of your AI conversations. We\'ll show you the key features and how to use them.',
    target: null,
    action: 'none',
    position: 'bottom',
    requiredInteraction: false
  },
  {
    id: 2,
    title: 'Character Settings Panel',
    description: 'Click here to open the character panel where you can access chat history, character details, and configuration settings.',
    target: '[data-tutorial="right-panel-toggle"]',
    action: 'click',
    position: 'left',
    requiredInteraction: true
  },
  {
    id: 3,
    title: 'Panel Navigation',
    description: 'Use these tabs to switch between Chat History, Character Details, and Configuration settings.',
    target: '[data-tutorial="right-panel-tabs"]',
    action: 'none',
    position: 'bottom',
    requiredInteraction: false
  },
  {
    id: 4,
    title: 'Configuration Tab',
    description: 'Click on the Config tab to access advanced settings and features.',
    target: '[data-tutorial="config-tab"]',
    action: 'click',
    position: 'left',
    requiredInteraction: true
  },
  {
    id: 5,
    title: 'Memories - Long-term Context',
    description: 'Memories are automatically generated every 15 responses from the character to create a long-term memory effect. These memories are shared between chats and don\'t cost credits.',
    target: '[data-tutorial="create-memory"]',
    action: 'none',
    position: 'left',
    requiredInteraction: false
  },
  {
    id: 6,
    title: 'Personas - Your Character',
    description: 'Personas define who YOU are in the conversation. Create different personas to roleplay as different characters or aspects of yourself.',
    target: '[data-tutorial="persona-section"]',
    action: 'none',
    position: 'left',
    requiredInteraction: false
  },
  {
    id: 7,
    title: 'World Info & Lore',
    description: 'Enhance conversations with world information and lore. Explore the available options to add depth to your chats.',
    target: '[data-tutorial="world-info-section"]',
    action: 'none',
    position: 'left',
    requiredInteraction: false
  },
  {
    id: 8,
    title: 'Global Addons',
    description: 'Addons enhance your conversations with features like mood tracking and relationship dynamics. They use additional credits but create more immersive experiences.',
    target: '[data-tutorial="global-addons-section"]',
    action: 'none',
    position: 'left',
    requiredInteraction: false,
    scrollTo: true
  },
  {
    id: 9,
    title: 'Create Characters',
    description: 'Build your own AI characters with unique personalities, backgrounds, and traits. Share them with the community or keep them private.',
    target: '[data-tutorial="create-character-nav"]',
    action: 'none',
    position: 'right',
    requiredInteraction: false
  },
  {
    id: 10,
    title: 'Discover Characters',
    description: 'Browse and chat with thousands of characters created by the community. Find your perfect AI companion, mentor, or adventure partner.',
    target: '[data-tutorial="discover-nav"]',
    action: 'none',
    position: 'right',
    requiredInteraction: false
  },
  {
    id: 11,
    title: 'World Info Library',
    description: 'Access and manage world building elements like locations, factions, and lore to create rich, consistent story worlds.',
    target: '[data-tutorial="world-info-nav"]',
    action: 'none',
    position: 'right',
    requiredInteraction: false
  },
  {
    id: 12,
    title: 'Welcome to Anima!',
    description: 'You\'ve completed the tour! Now you\'re ready to create amazing AI conversations with all the powerful features at your fingertips.',
    target: null,
    action: 'none',
    position: 'center',
    requiredInteraction: false
  }
];

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

interface TutorialProviderProps {
  children: ReactNode;
}

export const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [addonDropdownOpen, setAddonDropdownOpen] = useState(false);
  const [worldInfoDropdownVisible, setWorldInfoDropdownVisible] = useState(false);
  const [highlightedElement, setHighlightedElement] = useState<string | null>(null);

  const currentStepData = tutorialSteps[currentStep] || null;
  const disableInteractions = isActive && currentStepData?.requiredInteraction === true;

  // Add body class when tutorial is active
  useEffect(() => {
    if (isActive) {
      document.body.classList.add('tutorial-active');
    } else {
      document.body.classList.remove('tutorial-active');
    }
    
    return () => {
      document.body.classList.remove('tutorial-active');
    };
  }, [isActive]);

  // Add a cleanup effect to ensure body class is removed
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      document.body.classList.remove('tutorial-active');
    };
  }, []);

  // Ensure cleanup when component unmounts or tutorial becomes inactive
  useEffect(() => {
    if (!isActive) {
      document.body.classList.remove('tutorial-active');
      console.log('🎓 Tutorial cleanup: Removed body class');
    }
  }, [isActive]);

  // Update tutorial completion status
  const updateTutorialStatus = useCallback(async (userId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: completed })
        .eq('id', userId);

      if (error) throw error;
      console.log('🎓 Tutorial status updated in profiles:', completed);
    } catch (error) {
      console.error('Error updating tutorial status:', error);
    }
  }, []);

  const startTutorial = useCallback(() => {
    console.log('🎓 Starting tutorial');
    setIsActive(true);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
    // Set initial highlight if first step has a target
    setHighlightedElement(tutorialSteps[0]?.target || null);
  }, []);

  const completeTutorial = useCallback(async () => {
    console.log('🎓 Completing tutorial - CALLED');
    console.log('🎓 Current state before completion:', { isActive, currentStep });
    
    // First set inactive to immediately hide overlay
    setIsActive(false);
    console.log('🎓 Tutorial set to inactive');
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
    setHighlightedElement(null);
    
    // Force remove body class
    document.body.classList.remove('tutorial-active');
    console.log('🎓 Body class removed');
    
    // Then update database
    if (user?.id) {
      try {
        await updateTutorialStatus(user.id, true);
        console.log('🎓 Tutorial status updated in database');
      } catch (error) {
        console.error('🎓 Failed to update tutorial status:', error);
      }
    }
    
    console.log('🎓 Tutorial completion finished');
  }, [user, updateTutorialStatus, isActive, currentStep]);

  const nextStep = useCallback(() => {
    console.log('🎓 NextStep called:', { currentStep, maxStep: tutorialSteps.length - 1 });
    
    if (currentStep < tutorialSteps.length - 1) {
      const nextIndex = currentStep + 1;
      const nextStepData = tutorialSteps[nextIndex];
      
      console.log('🎓 Advancing to step:', { nextIndex, stepTitle: nextStepData?.title });
      
      // Update step and highlight together
      setCurrentStep(nextIndex);
      setHighlightedElement(nextStepData?.target || null);
    } else {
      // Already on the final step, calling nextStep should complete tutorial
      console.log('🎓 Already on final step, completing tutorial');
      completeTutorial();
    }
  }, [currentStep, completeTutorial]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      const prevIndex = currentStep - 1;
      const prevStepData = tutorialSteps[prevIndex];
      
      // Update step and highlight together
      setCurrentStep(prevIndex);
      setHighlightedElement(prevStepData?.target || null);
    }
  }, [currentStep]);

  const skipTutorial = useCallback(async () => {
    console.log('🎓 Skipping tutorial');
    if (user?.id) {
      await updateTutorialStatus(user.id, true);
    }
    
    setIsActive(false);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
    setHighlightedElement(null);
  }, [user, updateTutorialStatus]);

  const markStepCompleted = useCallback((stepId: number) => {
    setCompletedSteps(prev => new Set(prev).add(stepId));
  }, []);

  const isStepCompleted = useCallback((stepId: number) => {
    return completedSteps.has(stepId);
  }, [completedSteps]);

  const handleStepAction = useCallback((action: string) => {
    console.log('🎯 Tutorial action received:', action);
    
    // Simple action handling - just advance to next step when actions complete
    if (action === 'right-panel-toggled' && currentStep === 1) {
      nextStep();
    } else if (action === 'config-tab-clicked' && currentStep === 3) {
      nextStep();
    }
  }, [currentStep, nextStep]);

  const setHighlight = useCallback((element: string | null) => {
    setHighlightedElement(element);
  }, []);

  const value: TutorialContextType = {
    isActive,
    currentStep,
    currentStepData,
    highlightedElement,
    tutorialSteps,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    setHighlight,
    handleStepAction,
    isStepCompleted,
    markStepCompleted,
    addonDropdownOpen,
    setAddonDropdownOpen,
    worldInfoDropdownVisible,
    setWorldInfoDropdownVisible,
    disableInteractions
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
};

export default TutorialContext;