import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export const ProperTutorialOverlay: React.FC = () => {
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
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const searchAttemptsRef = useRef(0);
  const maxSearchAttempts = 50; // 5 seconds max
  const highlightedElementRef = useRef<HTMLElement | null>(null);

  // Debug logging
  console.log('🎯 ProperTutorialOverlay render:', {
    isActive,
    currentStep,
    currentStepData: currentStepData?.title,
    highlightedElement,
    isReady,
    tooltipPosition
  });

  // Calculate tooltip position based on highlighted element
  const calculateTooltipPosition = useCallback((rect: DOMRect, position?: string) => {
    const tooltipWidth = 400;
    const tooltipHeight = 300;
    const margin = 20;
    
    let top = 0;
    let left = 0;

    switch (position) {
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - margin;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + margin;
        break;
      case 'top':
        top = rect.top - tooltipHeight - margin;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'bottom':
      default:
        top = rect.bottom + margin;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
    }

    // Keep tooltip in viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));

    return { top, left };
  }, []);

  // Find and highlight element
  const findAndHighlightElement = useCallback(() => {
    if (!highlightedElement) {
      setHighlightedRect(null);
      // For steps without targets, show tooltip in center
      setTooltipPosition({ 
        top: window.innerHeight / 2 - 150, 
        left: window.innerWidth / 2 - 200 
      });
      setIsReady(true);
      searchAttemptsRef.current = 0;
      console.log('📍 No target element, showing tooltip in center');
      return;
    }

    const element = document.querySelector(highlightedElement) as HTMLElement;
    if (element) {
      const rect = element.getBoundingClientRect();
      setHighlightedRect(rect);
      
      // Store reference to the element
      highlightedElementRef.current = element;
      
      // Ensure element is visible and interactive - CRITICAL
      const originalZIndex = element.style.zIndex;
      const originalPosition = element.style.position;
      const originalPointerEvents = element.style.pointerEvents;
      
      // Force element above overlay
      element.style.zIndex = '2147483648'; // Higher than overlay
      element.style.position = 'relative';
      element.style.pointerEvents = 'auto';
      
      // Store original values for cleanup
      element.dataset.originalZIndex = originalZIndex;
      element.dataset.originalPosition = originalPosition;
      element.dataset.originalPointerEvents = originalPointerEvents;
      
      // Calculate position immediately
      const pos = calculateTooltipPosition(rect, currentStepData?.position);
      setTooltipPosition(pos);
      setIsReady(true);
      searchAttemptsRef.current = 0;
      
      console.log('✅ Element found and positioned:', highlightedElement);
    } else {
      searchAttemptsRef.current++;
      if (searchAttemptsRef.current >= maxSearchAttempts) {
        console.warn('❌ Element not found after max attempts:', highlightedElement);
        // Show tooltip in center if element not found
        setTooltipPosition({ 
          top: window.innerHeight / 2 - 150, 
          left: window.innerWidth / 2 - 200 
        });
        setIsReady(true);
      }
    }
  }, [highlightedElement, currentStepData?.position, calculateTooltipPosition]);

  // Watch for element to appear
  useEffect(() => {
    if (!isActive || !currentStepData) return;

    // Cleanup previous element
    if (highlightedElementRef.current) {
      const element = highlightedElementRef.current;
      if (element.dataset.originalZIndex !== undefined) {
        element.style.zIndex = element.dataset.originalZIndex;
      }
      if (element.dataset.originalPosition !== undefined) {
        element.style.position = element.dataset.originalPosition;
      }
      if (element.dataset.originalPointerEvents !== undefined) {
        element.style.pointerEvents = element.dataset.originalPointerEvents;
      }
      // Clean up dataset
      delete element.dataset.originalZIndex;
      delete element.dataset.originalPosition;
      delete element.dataset.originalPointerEvents;
      highlightedElementRef.current = null;
    }

    // Reset ready state when step changes
    setIsReady(false);
    searchAttemptsRef.current = 0;

    // Initial search
    findAndHighlightElement();

    // Set up observer
    observerRef.current = new MutationObserver(() => {
      if (searchAttemptsRef.current < maxSearchAttempts) {
        findAndHighlightElement();
      }
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    // Retry timer
    const retryInterval = setInterval(() => {
      if (searchAttemptsRef.current < maxSearchAttempts && !isReady) {
        findAndHighlightElement();
      } else {
        clearInterval(retryInterval);
      }
    }, 100);

    // Update on resize/scroll
    const updatePosition = () => {
      if (highlightedRect && highlightedElement) {
        const element = document.querySelector(highlightedElement);
        if (element) {
          const rect = element.getBoundingClientRect();
          setHighlightedRect(rect);
          const pos = calculateTooltipPosition(rect, currentStepData?.position);
          setTooltipPosition(pos);
        }
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      observerRef.current?.disconnect();
      clearInterval(retryInterval);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isActive, currentStepData, findAndHighlightElement, highlightedElement, calculateTooltipPosition, isReady]);

  // Simplified click handling - only for auto-advance
  useEffect(() => {
    if (!isActive || !currentStepData?.requiredInteraction || !highlightedElement) return;

    const handleClick = (e: MouseEvent) => {
      const element = document.querySelector(highlightedElement);
      if (element && element.contains(e.target as Node)) {
        // Element was clicked, advance tutorial after a short delay
        console.log('🎯 Tutorial target clicked, advancing...');
        setTimeout(nextStep, 300);
      }
    };

    // Use capture phase but don't prevent default
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isActive, currentStepData, highlightedElement, nextStep]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      if (highlightedElementRef.current) {
        const element = highlightedElementRef.current;
        if (element.dataset.originalZIndex !== undefined) {
          element.style.zIndex = element.dataset.originalZIndex;
        }
        if (element.dataset.originalPosition !== undefined) {
          element.style.position = element.dataset.originalPosition;
        }
        if (element.dataset.originalPointerEvents !== undefined) {
          element.style.pointerEvents = element.dataset.originalPointerEvents;
        }
        delete element.dataset.originalZIndex;
        delete element.dataset.originalPosition;
        delete element.dataset.originalPointerEvents;
      }
    };
  }, []);

  if (!isActive || !currentStepData) return null;

  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <>
      {/* Main overlay container - absolute highest z-index */}
      <div className="tutorial-overlay-container" style={{ 
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647, // Maximum z-index value
        pointerEvents: 'none'
      }}>
        {/* Simple box-shadow cutout overlay - NO BLACK BACKGROUND */}
        {highlightedRect && (
          <>
            {/* Box-shadow cutout - creates dark background EXCEPT highlighted area */}
            <div
              style={{
                position: 'absolute',
                top: highlightedRect.top - 8,
                left: highlightedRect.left - 8,
                width: highlightedRect.width + 16,
                height: highlightedRect.height + 16,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
                backgroundColor: 'transparent',
                borderRadius: '8px',
                pointerEvents: 'none', // CRITICAL: Does not block clicks
                zIndex: 2147483645 // Below highlighted element
              }}
            />
            
            {/* Orange highlight border - DOES NOT BLOCK CLICKS */}
            <div
              style={{
                position: 'absolute',
                top: highlightedRect.top - 8,
                left: highlightedRect.left - 8,
                width: highlightedRect.width + 16,
                height: highlightedRect.height + 16,
                border: '3px solid #FF7A00',
                borderRadius: '8px',
                boxShadow: '0 0 30px rgba(255, 122, 0, 0.8), inset 0 0 20px rgba(255, 122, 0, 0.3)',
                pointerEvents: 'none', // CRITICAL: Does not block clicks
                zIndex: 2147483646 // Below the highlighted element
              }}
            >
              {currentStepData.requiredInteraction && (
                <div 
                  className="absolute inset-0 rounded-lg"
                  style={{
                    animation: 'pulse 2s ease-in-out infinite',
                    pointerEvents: 'none'
                  }}
                />
              )}
            </div>
          </>
        )}

        {/* Tutorial tooltip - show immediately when active */}
        {((isReady && tooltipPosition) || (!highlightedElement && currentStepData)) && (
          <div 
            className="bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6 w-[400px]"
            style={{
              position: 'absolute',
              top: `${tooltipPosition?.top || window.innerHeight / 2 - 150}px`,
              left: `${tooltipPosition?.left || window.innerWidth / 2 - 200}px`,
              pointerEvents: 'auto',
              opacity: 1,
              transition: 'none' // No transition to prevent flickering
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
        )}
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
