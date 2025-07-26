import React, { useEffect, useState, useRef } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export const SimpleTutorialOverlay: React.FC = () => {
  const { 
    isActive, 
    currentStepData, 
    currentStep,
    tutorialSteps,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    handleStepAction
  } = useTutorial();

  const [highlightedRect, setHighlightedRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  // Update highlight when step changes
  useEffect(() => {
    if (!isActive || !currentStepData) return;

    // Clear previous highlight
    setHighlightedRect(null);

    // If step has a target, highlight it
    if (currentStepData.target) {
      const updateHighlight = () => {
        const element = document.querySelector(currentStepData.target!);
        if (element) {
          const rect = element.getBoundingClientRect();
          setHighlightedRect(rect);
          
          // Calculate tooltip position
          const tooltipWidth = 400;
          const tooltipHeight = 250;
          let top = rect.top + rect.height / 2 - tooltipHeight / 2;
          let left = rect.left - tooltipWidth - 20;

          // Adjust position based on step position preference
          switch (currentStepData.position) {
            case 'right':
              left = rect.right + 20;
              break;
            case 'top':
              top = rect.top - tooltipHeight - 20;
              left = rect.left + rect.width / 2 - tooltipWidth / 2;
              break;
            case 'bottom':
              top = rect.bottom + 20;
              left = rect.left + rect.width / 2 - tooltipWidth / 2;
              break;
          }

          // Keep tooltip in viewport
          const margin = 20;
          left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));
          top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));

          setTooltipPosition({ top, left });
        }
      };

      // Initial update
      updateHighlight();

      // Update on scroll/resize
      window.addEventListener('scroll', updateHighlight, true);
      window.addEventListener('resize', updateHighlight);

      return () => {
        window.removeEventListener('scroll', updateHighlight, true);
        window.removeEventListener('resize', updateHighlight);
      };
    } else {
      // No target - center the tooltip
      setTooltipPosition({
        top: window.innerHeight / 2 - 125,
        left: window.innerWidth / 2 - 200
      });
    }
  }, [currentStepData, isActive, currentStep]);

  // Add this useEffect to handle clicks properly
  useEffect(() => {
    if (!isActive || !currentStepData?.requiredInteraction || !currentStepData.target) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const element = document.querySelector(currentStepData.target!);
      
      if (element && element.contains(target)) {
        // Allow the click through - don't prevent it
        console.log('Clicked on highlighted element');
        // The actual element will handle its own click
      } else {
        // Block clicks outside
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Use capture phase to intercept before other handlers
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousedown', handleClick, true);
    
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('mousedown', handleClick, true);
    };
  }, [isActive, currentStepData]);

  if (!isActive || !currentStepData) return null;

  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <>
      {/* Highlighted area cutout and overlay */}
      {highlightedRect && (
        <>
          {/* Create a "hole" in the overlay using boxShadow */}
          <div
            className="fixed z-[999999] pointer-events-none"
            style={{
              top: highlightedRect.top - 5,
              left: highlightedRect.left - 5,
              width: highlightedRect.width + 10,
              height: highlightedRect.height + 10,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
              borderRadius: '8px',
            }}
          />
          
          {/* Clickable area over the highlighted element */}
          {currentStepData?.requiredInteraction && (
            <div
              className="fixed z-[1000000]"
              style={{
                top: highlightedRect.top,
                left: highlightedRect.left,
                width: highlightedRect.width,
                height: highlightedRect.height,
                pointerEvents: 'none',
              }}
            />
          )}
          
          {/* Highlight border */}
          <div
            className="fixed z-[999999] pointer-events-none border-2 border-[#FF7A00] rounded-lg"
            style={{
              top: highlightedRect.top - 5,
              left: highlightedRect.left - 5,
              width: highlightedRect.width + 10,
              height: highlightedRect.height + 10,
              boxShadow: '0 0 20px rgba(255, 122, 0, 0.8), inset 0 0 20px rgba(255, 122, 0, 0.3)',
            }}
          >
            {currentStepData.requiredInteraction && (
              <div className="absolute inset-0 rounded-lg animate-pulse-glow" />
            )}
          </div>
        </>
      )}
      
      {/* Full-screen overlay for non-highlighted steps or to block clicks */}
      {!highlightedRect && (
        <div 
          className="fixed inset-0 bg-black/80 z-[999998]"
          style={{ pointerEvents: 'auto' }}
        />
      )}
      
      {/* Tutorial tooltip */}
      <div 
        className="fixed z-[1000001] bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6 w-[400px]"
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg pr-4">{currentStepData.title}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={skipTutorial}
            className="text-gray-400 hover:text-white flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-gray-300">{currentStepData.description}</p>
          
          {currentStepData.requiredInteraction && (
            <div className="bg-[#FF7A00]/10 border border-[#FF7A00]/30 rounded-lg p-3 mt-3">
              <p className="text-[#FF7A00] text-sm font-medium flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[#FF7A00] rounded-full animate-pulse"></span>
                Click the highlighted element to continue
              </p>
            </div>
          )}
        </div>

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
                {currentStepData.requiredInteraction ? 'Complete Action' : 'Next'}
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

      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(255, 122, 0, 0.6);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(255, 122, 0, 0);
          }
        }
        
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
};
