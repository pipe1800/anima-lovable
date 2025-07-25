import React, { useEffect, useState } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export const TutorialOverlay: React.FC = () => {
  const { 
    isActive, 
    currentStepData, 
    highlightedElement,
    currentStep,
    tutorialSteps,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial
  } = useTutorial();
  
  const [highlightedRect, setHighlightedRect] = useState<DOMRect | null>(null);

  console.log('🎓 TutorialOverlay: Rendering', {
    isActive,
    currentStepData,
    highlightedElement
  });

  useEffect(() => {
    if (highlightedElement) {
      const element = document.querySelector(highlightedElement);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightedRect(rect);
      } else {
        console.warn('🎓 TutorialOverlay: Element not found:', highlightedElement);
        setHighlightedRect(null);
      }
    } else {
      setHighlightedRect(null);
    }
  }, [highlightedElement]);

  if (!isActive || !currentStepData) {
    console.log('🎓 TutorialOverlay: Not rendering - inactive or no step data');
    return null;
  }

  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <>
      {/* Dark overlay */}
      <div 
        className="fixed inset-0 bg-black/80 z-[9998]"
        onClick={(e) => e.stopPropagation()}
      />
      
      {/* Highlight box around element */}
      {highlightedRect && (
        <div
          className="fixed z-[9999] pointer-events-none border-2 border-[#FF7A00] rounded-lg"
          style={{
            top: highlightedRect.top - 4,
            left: highlightedRect.left - 4,
            width: highlightedRect.width + 8,
            height: highlightedRect.height + 8,
            boxShadow: '0 0 0 4px rgba(255, 122, 0, 0.3), 0 0 20px rgba(255, 122, 0, 0.5)'
          }}
        />
      )}
      
      {/* Tutorial tooltip */}
      <div 
        className="fixed z-[10000] bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6 max-w-md"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          minWidth: '400px'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg">{currentStepData.title}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={skipTutorial}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <p className="text-gray-300 mb-6">{currentStepData.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Step {currentStep + 1} of {tutorialSteps.length}
          </div>
          
          <div className="flex space-x-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={previousStep}
                className="text-gray-300 border-gray-600 hover:bg-gray-800"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
            
            {!isLastStep ? (
              <Button
                size="sm"
                onClick={nextStep}
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
                disabled={currentStepData.requiredInteraction}
              >
                {currentStepData.requiredInteraction ? 'Complete Action First' : 'Next'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={completeTutorial}
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
              >
                Finish Tour
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#FF7A00] transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tutorialSteps.length) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
};