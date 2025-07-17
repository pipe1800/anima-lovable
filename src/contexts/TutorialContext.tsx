import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  target: string;
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
    title: 'Character Addons',
    description: 'These are extensions that enhance your roleplay experience but increase credit costs. Click on the Addons dropdown to see available options.',
    target: '[data-tutorial="addons-dropdown"]',
    action: 'click',
    position: 'bottom',
    requiredInteraction: true,
    forceOpen: 'addons-dropdown'
  },
  {
    id: 2,
    title: 'Interface Modifications',
    description: 'Some addons will modify the chat interface to provide new interactive elements and features.',
    target: '[data-tutorial="addons-dropdown"]',
    action: 'none',
    position: 'bottom',
    requiredInteraction: false
  },
  {
    id: 3,
    title: 'Enable Dynamic World Info',
    description: 'Turn on the Dynamic World Info addon to enhance your character interactions with rich world knowledge.',
    target: '[data-tutorial="dynamic-world-info-addon"]',
    action: 'toggle',
    position: 'left',
    requiredInteraction: true
  },
  {
    id: 4,
    title: 'Save Configuration',
    description: 'Click Save to apply your addon settings and make them active in your chat.',
    target: '[data-tutorial="save-addons-button"]',
    action: 'save',
    position: 'top',
    requiredInteraction: true
  },
  {
    id: 5,
    title: 'Your Persona',
    description: 'Select or create a persona that represents you in the chat. This persona will be taken into context by the AI to better interact with your character.',
    target: '[data-tutorial="persona-dropdown"]',
    action: 'click',
    position: 'bottom',
    requiredInteraction: true
  },
  {
    id: 6,
    title: 'World Info Selection',
    description: 'Since Dynamic World Info is active, you can now select a world info to enhance your character interactions.',
    target: '[data-tutorial="world-info-dropdown"]',
    action: 'select',
    position: 'bottom',
    requiredInteraction: true
  },
  {
    id: 7,
    title: 'Discover Page',
    description: 'Visit the Discover page to find new characters and world infos created by the community.',
    target: '[data-tutorial="discover-nav"]',
    action: 'none',
    position: 'right',
    requiredInteraction: false
  },
  {
    id: 8,
    title: 'World Info Management',
    description: 'Create and manage your world infos here. Once created, they will appear in the world info dropdown in chat.',
    target: '[data-tutorial="world-info-nav"]',
    action: 'none',
    position: 'right',
    requiredInteraction: false
  },
  {
    id: 9,
    title: 'Chat History & Details',
    description: 'Click this menu to access your chat history and view character details.',
    target: '[data-tutorial="right-panel-toggle"]',
    action: 'click',
    position: 'left',
    requiredInteraction: true
  },
  {
    id: 10,
    title: 'Credits System',
    description: 'Credits are consumed with each message you send. Addons increase the credit cost based on their complexity.',
    target: '[data-tutorial="credits-display"]',
    action: 'none',
    position: 'top',
    requiredInteraction: false
  }
];

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

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
  const disableInteractions = isActive && currentStepData?.requiredInteraction === false;

  const startTutorial = useCallback(() => {
    setIsActive(true);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setHighlightedElement(tutorialSteps[0]?.target || null);
    
    // Force open addon dropdown for first step
    if (tutorialSteps[0]?.forceOpen === 'addons-dropdown') {
      setAddonDropdownOpen(true);
    }
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < tutorialSteps.length - 1) {
      const nextStepIndex = currentStep + 1;
      const nextStepData = tutorialSteps[nextStepIndex];
      
      setCurrentStep(nextStepIndex);
      setHighlightedElement(nextStepData?.target || null);
      
      // Handle step-specific logic
      if (nextStepData?.forceOpen === 'addons-dropdown') {
        setAddonDropdownOpen(true);
      }
      
      // Show world info dropdown for step 6
      if (nextStepIndex === 5) { // Step 6 (0-indexed)
        setWorldInfoDropdownVisible(true);
      }
    }
  }, [currentStep]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      const prevStepData = tutorialSteps[prevStepIndex];
      
      setCurrentStep(prevStepIndex);
      setHighlightedElement(prevStepData?.target || null);
      
      // Handle step-specific logic
      if (prevStepData?.forceOpen === 'addons-dropdown') {
        setAddonDropdownOpen(true);
      }
    }
  }, [currentStep]);

  const skipTutorial = useCallback(async () => {
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: { 
            chat_tutorial_completed: true
          }
        });
      } catch (error) {
        console.error('Error updating tutorial status:', error);
      }
    }
    
    setIsActive(false);
    setCurrentStep(0);
    setHighlightedElement(null);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
  }, [user]);

  const completeTutorial = useCallback(async () => {
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: { 
            chat_tutorial_completed: true
          }
        });
      } catch (error) {
        console.error('Error updating tutorial status:', error);
      }
    }
    
    setIsActive(false);
    setCurrentStep(0);
    setHighlightedElement(null);
    setCompletedSteps(new Set());
    setAddonDropdownOpen(false);
    setWorldInfoDropdownVisible(false);
  }, [user]);

  const setHighlight = useCallback((element: string | null) => {
    setHighlightedElement(element);
  }, []);

  const handleStepAction = useCallback((action: string) => {
    const stepData = currentStepData;
    if (!stepData) return;

    switch (action) {
      case 'addons-dropdown-clicked':
        if (stepData.action === 'click' && stepData.target.includes('addons-dropdown')) {
          markStepCompleted(stepData.id);
          setTimeout(() => nextStep(), 500);
        }
        break;
      case 'dynamic-world-info-toggled':
        if (stepData.action === 'toggle' && stepData.target.includes('dynamic-world-info')) {
          markStepCompleted(stepData.id);
          setTimeout(() => nextStep(), 500);
        }
        break;
      case 'addons-saved':
        if (stepData.action === 'save' && stepData.target.includes('save-addons')) {
          markStepCompleted(stepData.id);
          setTimeout(() => nextStep(), 500);
        }
        break;
      case 'persona-dropdown-clicked':
        if (stepData.action === 'click' && stepData.target.includes('persona-dropdown')) {
          markStepCompleted(stepData.id);
          setTimeout(() => nextStep(), 500);
        }
        break;
      case 'world-info-selected':
        if (stepData.action === 'select' && stepData.target.includes('world-info-dropdown')) {
          markStepCompleted(stepData.id);
          setTimeout(() => nextStep(), 500);  
        }
        break;
      case 'right-panel-toggled':
        if (stepData.action === 'click' && stepData.target.includes('right-panel')) {
          markStepCompleted(stepData.id);
          setTimeout(() => nextStep(), 500);
        }
        break;
      default:
        break;
    }
  }, [currentStepData, nextStep]);

  const isStepCompleted = useCallback((stepId: number) => {
    return completedSteps.has(stepId);
  }, [completedSteps]);

  const markStepCompleted = useCallback((stepId: number) => {
    setCompletedSteps(prev => new Set(prev).add(stepId));
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

export const useTutorial = (): TutorialContextType => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};