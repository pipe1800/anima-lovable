import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  target: string | null;
  action?: 'click' | 'toggle' | 'save' | 'select' | 'none';
  position?: 'top' | 'bottom' | 'left' | 'right';
  requiredInteraction?: boolean;
  forceOpen?: string; // Element to force open (like dropdown)
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
    description: 'Switch between History (past conversations), Details (character info), and Configuration (chat settings) tabs.',
    target: '[data-tutorial="panel-tabs"]',
    action: 'none',
    position: 'left',
    requiredInteraction: false
  },
  {
    id: 4,
    title: 'Enhanced Memory',
    description: 'Create memories from your conversations. The AI will remember important details for future chats. Click here when you want to save a memorable moment.',
    target: '[data-tutorial="create-memory"]',
    action: 'none',
    position: 'left',
    requiredInteraction: false
  },
  {
    id: 5,
    title: 'Configuration Tab',
    description: 'Click the Config tab to access persona and world info settings for this character.',
    target: '[data-tutorial="config-tab"]',
    action: 'click',
    position: 'left',
    requiredInteraction: true
  },
  {
    id: 6,
    title: 'Personas - Your Character',
    description: 'Personas define who YOU are in the conversation. Create different personas to roleplay as different characters or aspects of yourself.',
    target: '[data-tutorial="persona-section"] > .flex.items-center.justify-between',
    action: 'none',
    position: 'left',
    requiredInteraction: false
  },
  {
    id: 7,
    title: 'World Info & Addons',
    description: 'Enhance conversations with world information and addons. Click here to explore available options.',
    target: '[data-tutorial="world-info-section"] > .flex.items-center.justify-between',
    action: 'click',
    position: 'left',
    requiredInteraction: true,
    forceOpen: 'world-info-dropdown'
  },
  {
    id: 8,
    title: 'Your Credits',
    description: 'Credits power AI responses and features. Keep track of your balance here.',
    target: '[data-tutorial="credits-display"]',
    action: 'none',
    position: 'bottom',
    requiredInteraction: false
  },
  {
    id: 9,
    title: 'Navigation Menu',
    description: 'Access other parts of the app through the main navigation menu.',
    target: '[data-tutorial="sidebar-trigger"]',
    action: 'click',
    position: 'right',
    requiredInteraction: true
  },
  {
    id: 10,
    title: 'Explore More Features',
    description: 'Use the sidebar to discover character creation, your dashboard, and other features.',
    target: null,
    action: 'none',
    position: 'right',
    requiredInteraction: false
  },
  {
    id: 11,
    title: 'Ready to Chat!',
    description: 'You\'re all set! Start your conversation by typing a message below. Enjoy exploring the world of AI conversations!',
    target: null,
    action: 'none',
    position: 'bottom',
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
    console.log('🎓 Completing tutorial');
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

  const nextStep = useCallback(() => {
    if (currentStep < tutorialSteps.length - 1) {
      const nextIndex = currentStep + 1;
      const nextStepData = tutorialSteps[nextIndex];
      
      // Clear current highlight immediately
      setHighlightedElement(null);
      
      // For steps that require elements to be rendered first, wait
      if (nextStepData?.target) {
        // Give time for animations and rendering
        setTimeout(() => {
          setCurrentStep(nextIndex);
          // Wait a bit more for element to be in DOM
          setTimeout(() => {
            setHighlightedElement(nextStepData.target);
          }, 300); // Wait for panel animation to complete
        }, 100);
      } else {
        setCurrentStep(nextIndex);
      }
    } else {
      completeTutorial();
    }
  }, [currentStep, completeTutorial]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      const prevIndex = currentStep - 1;
      const prevStepData = tutorialSteps[prevIndex];
      
      // Clear current highlight immediately
      setHighlightedElement(null);
      
      setTimeout(() => {
        setCurrentStep(prevIndex);
        if (prevStepData?.target) {
          setTimeout(() => {
            setHighlightedElement(prevStepData.target);
          }, 300);
        }
      }, 100);
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
    } else if (action === 'config-tab-clicked' && currentStep === 4) {
      nextStep();
    } else if (action === 'world-info-dropdown-opened' && currentStep === 6) {
      setWorldInfoDropdownVisible(true);
      nextStep();
    } else if (action === 'sidebar-opened' && currentStep === 8) {
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