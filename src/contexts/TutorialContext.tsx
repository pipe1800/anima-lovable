import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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
    target: '[data-tutorial="persona-section"]',
    action: 'none',
    position: 'left',
    requiredInteraction: false
  },
  {
    id: 7,
    title: 'World Info & Addons',
    description: 'Enhance conversations with world information and addons. Click here to explore available options.',
    target: '[data-tutorial="world-info-section"]',
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
  const [highlightedElement, setHighlightedElement] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [addonDropdownOpen, setAddonDropdownOpen] = useState(false);
  const [worldInfoDropdownVisible, setWorldInfoDropdownVisible] = useState(false);

  const currentStepData = tutorialSteps[currentStep] || null;
  const disableInteractions = isActive && currentStepData?.requiredInteraction === true;

  // Update tutorial completion status in profiles table using onboarding_completed field
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

  const startTutorial = useCallback(async () => {
    console.log('🎓 Starting tutorial');
    setIsActive(true);
    setCurrentStep(0);
    setHighlightedElement(tutorialSteps[0]?.target || null);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
    
    console.log('🎓 Tutorial started with first step:', tutorialSteps[0]);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < tutorialSteps.length - 1) {
      const nextStepIndex = currentStep + 1;
      const nextStepData = tutorialSteps[nextStepIndex];
      setCurrentStep(nextStepIndex);
      setHighlightedElement(nextStepData?.target || null);
      console.log('🎓 Moving to step:', nextStepIndex + 1, nextStepData);
    } else {
      // Tutorial is complete
      completeTutorial();
    }
  }, [currentStep]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      const prevStepData = tutorialSteps[prevStepIndex];
      setCurrentStep(prevStepIndex);
      setHighlightedElement(prevStepData?.target || null);
      console.log('🎓 Moving back to step:', prevStepIndex + 1, prevStepData);
    }
  }, [currentStep]);

  const skipTutorial = useCallback(async () => {
    console.log('🎓 Skipping tutorial');
    if (user?.id) {
      await updateTutorialStatus(user.id, true);
    }
    
    setIsActive(false);
    setCurrentStep(0);
    setHighlightedElement(null);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
  }, [user, updateTutorialStatus]);

  const completeTutorial = useCallback(async () => {
    console.log('🎓 Completing tutorial');
    if (user?.id) {
      await updateTutorialStatus(user.id, true);
    }
    
    setIsActive(false);
    setCurrentStep(0);
    setHighlightedElement(null);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
  }, [user, updateTutorialStatus]);

  const setHighlight = useCallback((element: string | null) => {
    setHighlightedElement(element);
  }, []);

  const handleStepAction = useCallback((action: string) => {
    console.log('🎯 Tutorial action received:', action, 'Current step:', currentStep + 1);
    
    const currentStepData = tutorialSteps[currentStep];
    if (!currentStepData) return;

    // Handle specific step actions
    switch (action) {
      case 'right-panel-toggled':
        if (currentStep === 1) { // Step 2: Character Settings Panel
          markStepCompleted(currentStepData.id);
          nextStep();
        }
        break;
      
      case 'config-tab-clicked':
        if (currentStep === 4) { // Step 5: Configuration Tab
          markStepCompleted(currentStepData.id);
          nextStep();
        }
        break;
      
      case 'world-info-dropdown-opened':
        if (currentStep === 6) { // Step 7: World Info & Addons
          setWorldInfoDropdownVisible(true);
          markStepCompleted(currentStepData.id);
          nextStep();
        }
        break;
      
      case 'sidebar-opened':
        if (currentStep === 8) { // Step 9: Navigation Menu
          markStepCompleted(currentStepData.id);
          nextStep();
        }
        break;
      
      default:
        console.log('🎯 Unhandled tutorial action:', action);
    }
  }, [currentStep, nextStep]);

  const isStepCompleted = useCallback((stepId: number) => {
    return completedSteps.has(stepId);
  }, [completedSteps]);

  const markStepCompleted = useCallback((stepId: number) => {
    setCompletedSteps(prev => new Set(prev).add(stepId));
    console.log('✅ Step completed:', stepId);
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