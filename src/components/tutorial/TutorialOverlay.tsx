import React, { useEffect, useState, useRef } from 'react';
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
    completeTutorial,
    setHighlight
  } = useTutorial();
  
  const [highlightedRect, setHighlightedRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  console.log('🎓 TutorialOverlay: Rendering', {
    isActive,
    currentStepData,
    highlightedElement
  });

    // FIX 1: PROPERLY clear highlight when step has no target
  useEffect(() => {
    if (currentStepData) {
      if (currentStepData.target) {
        console.log('🎓 Setting highlight to:', currentStepData.target);
        setHighlight(currentStepData.target);
      } else {
        console.log('🎓 Clearing highlight - step has no target');
        setHighlight(null);
        setHighlightedRect(null); // Also clear the rect immediately
      }
    }
  }, [currentStepData, setHighlight]);

  useEffect(() => {
    if (!highlightedElement) {
      console.log('🎓 No highlighted element - clearing rect immediately');
      setHighlightedRect(null);
      return;
    }

    // Clear the rect first to ensure clean transition
    setHighlightedRect(null);

    const updateRect = () => {
      const element = document.querySelector(highlightedElement);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightedRect(rect);
        console.log('🎓 Updated highlight rect for:', highlightedElement);
      } else {
        console.warn('🎓 TutorialOverlay: Element not found:', highlightedElement);
        setHighlightedRect(null);
      }
    };

    // Delay to ensure DOM has updated and previous highlight is cleared
    const timer = setTimeout(() => {
      updateRect();
      
      // Update rect on scroll or resize
      window.addEventListener('scroll', updateRect, true);
      window.addEventListener('resize', updateRect);
      
      // Use MutationObserver to detect DOM changes
      const observer = new MutationObserver(updateRect);
      observer.observe(document.body, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        attributeFilter: ['class', 'style']
      });

      // Also update on any transition end
      document.addEventListener('transitionend', updateRect);

      return () => {
        window.removeEventListener('scroll', updateRect, true);
        window.removeEventListener('resize', updateRect);
        document.removeEventListener('transitionend', updateRect);
        observer.disconnect();
      };
    }, 50); // Shorter delay for snappier transitions

    return () => {
      clearTimeout(timer);
      setHighlightedRect(null); // Clear rect when unmounting
    };
  }, [highlightedElement]);

  // Handle clicks globally
  useEffect(() => {
    if (!isActive) return;

    const handleGlobalClick = (e: MouseEvent) => {
      // Check if click is on highlighted element
      if (highlightedElement) {
        const targetElement = document.querySelector(highlightedElement);
        if (targetElement && targetElement.contains(e.target as Node)) {
          console.log('🎓 Tutorial: Highlighted element clicked, allowing interaction');
          // Don't prevent default - let the click go through
          
          // If this step requires interaction, advance after a delay
          if (currentStepData?.requiredInteraction) {
            setTimeout(() => {
              console.log('🎓 Tutorial: Advancing to next step after interaction');
              nextStep();
            }, 500); // Give time for UI to update
          }
          return;
        }
      }

      // Check if click is on the tutorial tooltip itself
      const tooltipElement = document.querySelector('.tutorial-tooltip');
      if (tooltipElement && tooltipElement.contains(e.target as Node)) {
        console.log('🎓 Tutorial: Click on tooltip, allowing interaction');
        return;
      }

      // Block all other clicks
      console.log('🎓 Tutorial: Blocking click outside highlighted area');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    // Add listener in capture phase to intercept all clicks
    document.addEventListener('click', handleGlobalClick, true);
    document.addEventListener('mousedown', handleGlobalClick, true);

    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
      document.removeEventListener('mousedown', handleGlobalClick, true);
    };
  }, [isActive, highlightedElement, currentStepData, nextStep]);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTutorial();
      } else if (e.key === 'ArrowRight' && !currentStepData?.requiredInteraction) {
        nextStep();
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        previousStep();
      }
    };

    if (isActive) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isActive, currentStep, currentStepData, nextStep, previousStep, skipTutorial]);

  // Apply styles to highlighted elements to ensure they're clickable
  useEffect(() => {
    if (highlightedElement && isActive) {
      const element = document.querySelector(highlightedElement) as HTMLElement;
      if (element) {
        // Store original values
        const originalZIndex = element.style.zIndex;
        const originalPosition = element.style.position;
        
        // Ensure element is above overlay
        element.style.position = 'relative';
        element.style.zIndex = '50001'; // Higher z-index to be above overlay
        
        return () => {
          // Restore original values
          element.style.zIndex = originalZIndex;
          element.style.position = originalPosition;
        };
      }
    }
  }, [highlightedElement, isActive]);

  if (!isActive || !currentStepData) {
    console.log('🎓 TutorialOverlay: Not rendering - inactive or no step data');
    return null;
  }

  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isMobile = window.innerWidth < 768;

  const getTooltipPosition = () => {
    if (!highlightedRect || !currentStepData.position) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const tooltipWidth = isMobile ? 300 : 400;
    const tooltipHeight = 320; // Increased for better content fit
    const margin = 20;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let position: any = { top: 0, left: 0 };

    switch (currentStepData.position) {
      case 'left':
        position.top = highlightedRect.top + highlightedRect.height / 2 - tooltipHeight / 2;
        position.left = highlightedRect.left - tooltipWidth - margin;
        
        // If would go off screen, flip to right
        if (position.left < margin) {
          position.left = highlightedRect.right + margin;
        }
        break;
        
      case 'right':
        position.top = highlightedRect.top + highlightedRect.height / 2 - tooltipHeight / 2;
        position.left = highlightedRect.right + margin;
        
        // If would go off screen, flip to left
        if (position.left + tooltipWidth > viewportWidth - margin) {
          position.left = highlightedRect.left - tooltipWidth - margin;
        }
        break;
        
      case 'top':
        position.top = highlightedRect.top - tooltipHeight - margin;
        position.left = highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2;
        
        // If too high, switch to bottom
        if (position.top < margin) {
          position.top = highlightedRect.bottom + margin;
        }
        break;
        
      case 'bottom':
        position.top = highlightedRect.bottom + margin;
        position.left = highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2;
        
        // If too low, switch to top
        if (position.top + tooltipHeight > viewportHeight - margin) {
          position.top = highlightedRect.top - tooltipHeight - margin;
        }
        break;
    }

    // Final boundary checks
    position.left = Math.max(margin, Math.min(position.left, viewportWidth - tooltipWidth - margin));
    position.top = Math.max(margin, Math.min(position.top, viewportHeight - tooltipHeight - margin));

    return position;
  };

  return (
    <div className="tutorial-overlay" ref={overlayRef}>
      {/* Dark overlay with cutout using CSS */}
      <div 
        className="fixed inset-0 z-[50000]" // FIX 2: Increased z-index to be above everything
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          pointerEvents: 'none', // Let clicks pass through the overlay itself
        }}
      >
        {/* Create a "hole" for the highlighted element */}
        {highlightedRect && (
          <div
            style={{
              position: 'fixed',
              top: highlightedRect.top - 4,
              left: highlightedRect.left - 4,
              width: highlightedRect.width + 8,
              height: highlightedRect.height + 8,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
              borderRadius: '8px',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      
      {/* Highlight box with glow effect */}
      {highlightedRect && (
        <div
          className="fixed z-[50001] pointer-events-none" // FIX 2: Increased z-index
          style={{
            top: highlightedRect.top - 4,
            left: highlightedRect.left - 4,
            width: highlightedRect.width + 8,
            height: highlightedRect.height + 8,
            border: '2px solid #FF7A00',
            borderRadius: '8px',
            boxShadow: currentStepData.requiredInteraction 
              ? '0 0 0 4px rgba(255, 122, 0, 0.3), 0 0 30px rgba(255, 122, 0, 0.6), inset 0 0 20px rgba(255, 122, 0, 0.2)'
              : '0 0 0 4px rgba(255, 122, 0, 0.3), 0 0 20px rgba(255, 122, 0, 0.5)',
          }}
        >
          {currentStepData.requiredInteraction && (
            <div className="absolute inset-0 rounded-lg animate-pulse-glow" />
          )}
        </div>
      )}

      {/* Tutorial tooltip */}
      <div 
        className="tutorial-tooltip fixed z-[50002] bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6 transition-all duration-300" // FIX 2: Increased z-index
        style={{
          ...getTooltipPosition(),
          minWidth: isMobile ? '300px' : '400px',
          maxWidth: isMobile ? '90vw' : '400px'
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
          <p className="text-gray-300 mb-3">{currentStepData.description}</p>
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
        
        /* Prevent text selection during tutorial */
        .tutorial-overlay {
          user-select: none;
        }
        
        /* Ensure tooltip is always visible */
        .tutorial-tooltip {
          pointer-events: auto !important;
        }
      `}</style>
    </div>
  );
};