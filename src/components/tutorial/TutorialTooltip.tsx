import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, ArrowLeft, X, ChevronRight } from 'lucide-react';
import { useTutorial } from '@/contexts/TutorialContext';
import { cn } from '@/lib/utils';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  target: string;
  action?: 'click' | 'toggle' | 'save' | 'select' | 'none';
  position?: 'top' | 'bottom' | 'left' | 'right';
  requiredInteraction?: boolean;
}

interface TutorialTooltipProps {
  targetRect: DOMRect;
  step: TutorialStep;
}

export const TutorialTooltip: React.FC<TutorialTooltipProps> = ({ targetRect, step }) => {
  const { 
    currentStep, 
    tutorialSteps, 
    nextStep, 
    previousStep, 
    skipTutorial, 
    completeTutorial,
    isStepCompleted,
    handleStepAction
  } = useTutorial();
  
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const calculatePosition = () => {
      const tooltipWidth = 320;
      const tooltipHeight = 200;
      const padding = 20;
      const arrowSize = 8;

      let top = 0;
      let left = 0;
      let arrowTop = 0;
      let arrowLeft = 0;

      switch (step.position) {
        case 'top':
          top = targetRect.top - tooltipHeight - padding;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          arrowTop = tooltipHeight - arrowSize;
          arrowLeft = tooltipWidth / 2 - arrowSize;
          break;
        case 'bottom':
          top = targetRect.bottom + padding;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          arrowTop = -arrowSize;
          arrowLeft = tooltipWidth / 2 - arrowSize;
          break;
        case 'left':
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.left - tooltipWidth - padding;
          arrowTop = tooltipHeight / 2 - arrowSize;
          arrowLeft = tooltipWidth - arrowSize;
          break;
        case 'right':
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.right + padding;
          arrowTop = tooltipHeight / 2 - arrowSize;
          arrowLeft = -arrowSize;
          break;
        default:
          top = targetRect.bottom + padding;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          arrowTop = -arrowSize;
          arrowLeft = tooltipWidth / 2 - arrowSize;
      }

      // Ensure tooltip stays within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < padding) left = padding;
      if (left + tooltipWidth > viewportWidth - padding) left = viewportWidth - tooltipWidth - padding;
      if (top < padding) top = padding;
      if (top + tooltipHeight > viewportHeight - padding) top = viewportHeight - tooltipHeight - padding;

      setTooltipPosition({ top, left });
      setArrowPosition({ top: arrowTop, left: arrowLeft });
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [targetRect, step.position]);

  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isFirstStep = currentStep === 0;
  const stepCompleted = isStepCompleted(step.id);

  const handleNext = () => {
    if (isLastStep) {
      completeTutorial();
    } else {
      nextStep();
    }
  };

  const handleSkip = () => {
    skipTutorial();
  };

  const getActionText = () => {
    switch (step.action) {
      case 'click':
        return 'Click the highlighted element to continue';
      case 'toggle':
        return 'Toggle the highlighted option to continue';
      case 'save':
        return 'Click Save to continue';
      case 'select':
        return 'Select an option to continue';
      default:
        return null;
    }
  };

  return (
    <Card
      className="fixed z-[10000] w-80 bg-[#1a1a2e] border-[#FF7A00] border-2 shadow-xl"
      style={{
        top: tooltipPosition.top,
        left: tooltipPosition.left,
      }}
    >
      {/* Arrow */}
      <div
        className="absolute w-0 h-0 border-8 border-transparent border-[#FF7A00]"
        style={{
          top: arrowPosition.top,
          left: arrowPosition.left,
          borderBottomColor: step.position === 'top' ? '#FF7A00' : 'transparent',
          borderTopColor: step.position === 'bottom' ? '#FF7A00' : 'transparent',
          borderRightColor: step.position === 'left' ? '#FF7A00' : 'transparent',
          borderLeftColor: step.position === 'right' ? '#FF7A00' : 'transparent',
        }}
      />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg font-bold">
            {step.title}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-gray-400 hover:text-white h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>Step {currentStep + 1} of {tutorialSteps.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-gray-300 text-sm leading-relaxed">
          {step.description}
        </p>

        {step.requiredInteraction && (
          <div className="p-3 bg-[#FF7A00]/20 rounded-lg border border-[#FF7A00]/30">
            <p className="text-[#FF7A00] text-sm font-medium">
              {getActionText()}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={previousStep}
            disabled={isFirstStep}
            className="text-gray-400 hover:text-white disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-gray-400 hover:text-white"
            >
              Skip Tutorial
            </Button>

            {!step.requiredInteraction && (
              <Button
                onClick={handleNext}
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
                size="sm"
              >
                {isLastStep ? 'Finish' : 'Next'}
                {!isLastStep && <ChevronRight className="w-4 h-4 ml-1" />}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};