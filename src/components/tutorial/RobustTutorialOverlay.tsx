import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export const RobustTutorialOverlay: React.FC = () => {
  const { 
    isActive, 
    currentStepData, 
    currentStep,
    tutorialSteps,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    highlightedElement
  } = useTutorial();

  const [highlightedRect, setHighlightedRect] = useState<DOMRect | null>(null);
  const [isElementFound, setIsElementFound] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const highlightedElementRef = useRef<HTMLElement | null>(null);

  // Function to find and highlight element
  const findAndHighlightElement = useCallback(() => {
    if (!highlightedElement) {
      setHighlightedRect(null);
      setIsElementFound(false);
      setShowTooltip(true); // Show tooltip immediately if no element to highlight
      return;
    }

    const element = document.querySelector(highlightedElement) as HTMLElement;
    if (element) {
      const rect = element.getBoundingClientRect();
      setHighlightedRect(rect);
      setIsElementFound(true);
      
      // Store reference to the element
      highlightedElementRef.current = element;
      
      // Ensure element is visible and interactive
      const originalPointerEvents = element.style.pointerEvents;
      const originalPosition = element.style.position;
      const originalZIndex = element.style.zIndex;
      
      element.style.pointerEvents = 'auto';
      element.style.position = 'relative';
      element.style.zIndex = '1000001';
      
      // Store original values for cleanup
      element.dataset.originalPointerEvents = originalPointerEvents;
      element.dataset.originalPosition = originalPosition;
      element.dataset.originalZIndex = originalZIndex;
      
      console.log('🎯 Element found and highlighted:', highlightedElement);
      
      // Only show tooltip after element is found and highlighted
      setTimeout(() => {
        setShowTooltip(true);
      }, 50);
    } else {
      console.log('⏳ Element not found yet:', highlightedElement);
      setIsElementFound(false);
      setShowTooltip(false); // Don't show tooltip until element is found
    }
  }, [highlightedElement]);

  // Reset tooltip visibility when step changes
  useEffect(() => {
    setShowTooltip(false);
  }, [currentStep]);

  // Set up MutationObserver to watch for DOM changes
  useEffect(() => {
    if (!isActive || !highlightedElement) return;

    // Initial attempt
    findAndHighlightElement();

    // Set up observer for DOM changes
    observerRef.current = new MutationObserver(() => {
      findAndHighlightElement();
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-tutorial']
    });

    // Also retry periodically until element is found
    const retryInterval = setInterval(() => {
      if (!isElementFound) {
        findAndHighlightElement();
      }
    }, 100);

    // Update on resize/scroll
    const updateRect = () => {
      if (isElementFound) {
        findAndHighlightElement();
      }
    };

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      observerRef.current?.disconnect();
      clearInterval(retryInterval);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      
      // Clean up element styling
      if (highlightedElement) {
        const element = document.querySelector(highlightedElement) as HTMLElement;
        if (element) {
          element.style.position = '';
          element.style.zIndex = '';
        }
      }
    };
  }, [isActive, highlightedElement, findAndHighlightElement, isElementFound]);

  // Handle clicks on highlighted elements
  useEffect(() => {
    if (!isActive || !currentStepData?.requiredInteraction || !highlightedRect) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const highlightedEl = document.querySelector(highlightedElement!);
      
      if (highlightedEl && highlightedEl.contains(target)) {
        console.log('✅ Clicked on highlighted element');
        // Don't prevent default - let the click through
        
        // Auto-advance after a delay to allow for animations
        setTimeout(() => {
          nextStep();
        }, 500);
      } else {
        // Block clicks outside highlighted area
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isActive, currentStepData, highlightedRect, highlightedElement, nextStep]);

  if (!isActive || !currentStepData) return null;

  const isLastStep = currentStep === tutorialSteps.length - 1;
  const showHighlight = highlightedElement && highlightedRect && isElementFound;

  return (
    <>
      {/* Dark overlay with highest z-index */}
      <div 
        className="fixed inset-0 bg-black/80"
        style={{ zIndex: 999998 }}
      />
      
      {/* Highlighted area cutout */}
      {showHighlight && (
        <>
          {/* Create a "hole" in the overlay */}
          <div
            className="fixed pointer-events-none"
            style={{
              top: highlightedRect.top - 8,
              left: highlightedRect.left - 8,
              width: highlightedRect.width + 16,
              height: highlightedRect.height + 16,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
              borderRadius: '8px',
              zIndex: 999999,
            }}
          />
          
          {/* Highlight border */}
          <div
            className="fixed pointer-events-none border-2 border-[#FF7A00] rounded-lg"
            style={{
              top: highlightedRect.top - 8,
              left: highlightedRect.left - 8,
              width: highlightedRect.width + 16,
              height: highlightedRect.height + 16,
              boxShadow: '0 0 30px rgba(255, 122, 0, 0.8), inset 0 0 20px rgba(255, 122, 0, 0.3)',
              zIndex: 999999,
            }}
          >
            {currentStepData.requiredInteraction && (
              <div 
                className="absolute inset-0 rounded-lg"
                style={{
                  animation: 'pulse 2s ease-in-out infinite',
                  boxShadow: '0 0 0 0 rgba(255, 122, 0, 0.6)',
                }}
              />
            )}
          </div>

          {/* Make highlighted element clickable */}
          <div
            className="fixed"
            style={{
              top: highlightedRect.top,
              left: highlightedRect.left,
              width: highlightedRect.width,
              height: highlightedRect.height,
              zIndex: 1000000,
              pointerEvents: 'auto',
            }}
          />
        </>
      )}
      
      {/* Tutorial tooltip - positioned based on highlight or centered */}
      <div 
        className="fixed bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6 w-[400px]"
        style={{
          zIndex: 1000002,
          top: showHighlight 
            ? Math.min(highlightedRect.bottom + 20, window.innerHeight - 300)
            : '50%',
          left: showHighlight
            ? Math.max(20, Math.min(highlightedRect.left, window.innerWidth - 420))
            : '50%',
          transform: showHighlight ? 'none' : 'translate(-50%, -50%)',
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
                {isElementFound 
                  ? 'Click the highlighted element to continue'
                  : 'Waiting for element to appear...'}
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
                disabled={currentStepData.requiredInteraction && !isElementFound}
              >
                {currentStepData.requiredInteraction 
                  ? (isElementFound ? 'Complete Action' : 'Waiting...') 
                  : 'Next'}
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
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(255, 122, 0, 0.6);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(255, 122, 0, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(255, 122, 0, 0);
          }
        }
      `}</style>
    </>
  );
};
