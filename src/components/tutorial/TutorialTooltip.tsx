import React from 'react';
import { Button } from '@/components/ui/button';
import { useTutorial } from '@/contexts/TutorialContext';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface TutorialTooltipProps {
  step: {
    id: number;
    title: string;
    description: string;
    target: string | null;
    action?: string;
    position?: string;
    requiredInteraction?: boolean;
  };
  targetRect: DOMRect | null;
  isMobile: boolean;
}

export const TutorialTooltip: React.FC<TutorialTooltipProps> = ({ 
  step, 
  targetRect, 
  isMobile 
}) => {
  const { 
    currentStep, 
    tutorialSteps, 
    nextStep, 
    previousStep, 
    skipTutorial 
  } = useTutorial();

  const getTooltipPosition = () => {
    if (!targetRect || !step.position) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const margin = 20;
    const tooltipWidth = isMobile ? 300 : 400;
    const tooltipHeight = 200;

    switch (step.position) {
      case 'left':
        return {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.left - tooltipWidth - margin,
        };
      case 'right':
        return {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.right + margin,
        };
      case 'top':
        return {
          top: targetRect.top - tooltipHeight - margin,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
      case 'bottom':
        return {
          top: targetRect.bottom + margin,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
      default:
        return {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        };
    }
  };

  const style = getTooltipPosition();

  return (
    <div 
      className="fixed z-[9999] bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6 max-w-md"
      style={{
        ...style,
        width: isMobile ? '90vw' : '400px',
        maxWidth: '400px'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-lg">{step.title}</h3>
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
      <p className="text-gray-300 mb-6">{step.description}</p>

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
          
          {currentStep < tutorialSteps.length - 1 ? (
            <Button
              size="sm"
              onClick={nextStep}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
              disabled={step.requiredInteraction}
            >
              {step.requiredInteraction ? 'Complete Action' : 'Next'}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={skipTutorial}
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
  );
};