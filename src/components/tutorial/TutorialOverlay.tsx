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

  // MOVE THE isActive CHECK TO THE TOP OF THE COMPONENT
  // This should be the FIRST check in the render
  if (!isActive) {
    console.log('🎓 TutorialOverlay: Tutorial not active, unmounting');
    return null;
  }

  // Add this after the console.log at line 27
  useEffect(() => {
    console.log('🎓 ALL TUTORIAL STEPS:', tutorialSteps.map((step, idx) => ({
      step: idx,
      title: step.title,
      target: step.target,
      requiredInteraction: step.requiredInteraction
    })));
  }, [tutorialSteps]);

    // FIX 1: PROPERLY clear highlight when step has no target
  useEffect(() => {
    if (currentStepData) {
      if (currentStepData.target) {
        console.log('🎓 Setting highlight to:', currentStepData.target);
        setHighlight(currentStepData.target);
        
        // Handle scrollTo if needed
        if (currentStepData.scrollTo) {
          // For addons section, scroll the right panel content
          if (currentStep === 7) { // Step 8 is now index 7
            const rightPanel = document.querySelector('[data-tutorial="right-panel"]');
            const addonsSection = document.querySelector(currentStepData.target) as HTMLElement;
            if (rightPanel && addonsSection) {
              const scrollContainer = rightPanel.querySelector('.overflow-y-auto') as HTMLElement;
              if (scrollContainer) {
                scrollContainer.scrollTo({
                  top: addonsSection.offsetTop - 100,
                  behavior: 'smooth'
                });
              }
            }
          } else {
            const element = document.querySelector(currentStepData.target);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
        
        // Special handling for right panel steps
        if (currentStepData.target?.includes('right-panel-tabs') || currentStepData.target?.includes('config-tab')) {
          // Wait for panel slide-in animation to complete (300ms based on animate-slide-in-right)
          setTimeout(() => {
            const element = document.querySelector(currentStepData.target);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 400); // Wait for panel animation + buffer
        }
      } else {
        console.log('🎓 Clearing highlight - step has no target');
        setHighlight(null);
        setHighlightedRect(null); // Also clear the rect immediately
      }
    }
  }, [currentStepData, setHighlight]);

  // Ensure sidebar is visible for navigation steps
  useEffect(() => {
    if (isActive && currentStep >= 8 && currentStep <= 10) {
      // Check if sidebar is collapsed
      const sidebarCollapsed = localStorage.getItem('sidebarCollapsed');
      if (sidebarCollapsed === 'true') {
        // Temporarily expand sidebar for tutorial
        localStorage.setItem('sidebarCollapsed', 'false');
        window.dispatchEvent(new CustomEvent('sidebarToggled'));
        
        // Restore state when tutorial ends
        return () => {
          if (sidebarCollapsed === 'true') {
            localStorage.setItem('sidebarCollapsed', 'true');
            window.dispatchEvent(new CustomEvent('sidebarToggled'));
          }
        };
      }
    }
  }, [isActive, currentStep]);

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
    }, currentStepData?.target?.includes('right-panel-tabs') || currentStepData?.target?.includes('config-tab') ? 300 : 50); // Longer delay for panel tabs

    return () => {
      clearTimeout(timer);
      setHighlightedRect(null); // Clear rect when unmounting
    };
  }, [highlightedElement]);

  // Handle clicks globally
  useEffect(() => {
    if (!isActive) return;

    const handleGlobalClick = (e: MouseEvent) => {
      // Check if click is on highlighted element or its children
      if (highlightedElement) {
        const targetElement = document.querySelector(highlightedElement);
        if (targetElement) {
          // Check if the clicked element is the target or any of its descendants
          let clickedElement = e.target as Node;
          while (clickedElement) {
            if (clickedElement === targetElement) {
              console.log('🎓 Tutorial: Click on highlighted element - allowing through');
              // Don't prevent default - let the click go through
              
              // If this step requires interaction, advance after a delay
              if (currentStepData?.requiredInteraction) {
                setTimeout(() => {
                  console.log('🎓 Tutorial: Advancing to next step after interaction');
                  nextStep();
                }, 500); // Give time for UI to update
              }
              return; // Let the click proceed naturally
            }
            clickedElement = clickedElement.parentNode as Node;
          }
        }
      }

      // Check if click is on the tutorial tooltip itself
      const tooltipElement = document.querySelector('.tutorial-tooltip');
      if (tooltipElement && tooltipElement.contains(e.target as Node)) {
        console.log('🎓 Tutorial: Click on tooltip, allowing interaction');
        return;
      }

      // Check if click is on "Finish Tour" button in completion screen
      const finishTourButton = (e.target as Element).closest('button');
      if (finishTourButton && finishTourButton.textContent?.includes('Finish Tour')) {
        console.log('🎓 Tutorial: Click on Finish Tour button, allowing interaction');
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
        const originalPointerEvents = element.style.pointerEvents;
        
        // Ensure element is above overlay and clickable
        element.style.position = 'relative';
        element.style.zIndex = '50003'; // Well above everything
        element.style.pointerEvents = 'auto'; // Ensure it can receive clicks
        
        // Also ensure any child elements are clickable
        const children = element.querySelectorAll('*');
        children.forEach((child: Element) => {
          const childEl = child as HTMLElement;
          childEl.style.pointerEvents = 'auto';
        });
        
        console.log('🎓 Applied high z-index to highlighted element:', highlightedElement);
        
        return () => {
          // Restore original values
          element.style.zIndex = originalZIndex;
          element.style.position = originalPosition;
          element.style.pointerEvents = originalPointerEvents;
          
          // Restore children
          children.forEach((child: Element) => {
            const childEl = child as HTMLElement;
            childEl.style.pointerEvents = '';
          });
        };
      }
    }
  }, [highlightedElement, isActive]);

  // Then check for currentStepData
  if (!currentStepData) {
    console.log('🎓 TutorialOverlay: No step data');
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

  // Check if this is the final step
  console.log('🎓 TutorialOverlay: Step check:', {
    currentStep,
    tutorialStepsLength: tutorialSteps.length,
    isFinalStep: currentStep === tutorialSteps.length - 1,
    currentStepData
  });
  
  // THEN check for final step (without isActive check)
  if (currentStep === tutorialSteps.length - 1) {
    return (
      <div className="tutorial-overlay" ref={overlayRef}>
        {/* Dark overlay */}
        <div 
          className="fixed inset-0 bg-black/80 z-[50000]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        
        {/* Centered completion message */}
        <div className="fixed inset-0 flex items-center justify-center z-[50002]">
          <div className="bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-8 max-w-md text-center">
            <div className="mb-6">
              <div className="w-20 h-20 bg-[#FF7A00]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-[#FF7A00]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Congratulations! 🎉</h3>
              <p className="text-gray-300 text-lg">
                You've successfully completed the tour and are ready to explore all the amazing features Anima has to offer. Let your creativity run wild!
              </p>
            </div>
            
            <Button
              onClick={() => {
                console.log('🎓 Finish Tour clicked - calling completeTutorial');
                completeTutorial();
                // Force immediate cleanup
                document.body.classList.remove('tutorial-active');
              }}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white px-8 py-3 text-lg font-semibold"
            >
              Finish Tour
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-overlay" ref={overlayRef}>
      {/* Dark overlay with proper cutout */}
      <div 
        className="fixed inset-0" 
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          clipPath: highlightedRect 
            ? `polygon(
                0% 0%, 
                0% 100%, 
                ${highlightedRect.left - 8}px 100%,
                ${highlightedRect.left - 8}px ${highlightedRect.top - 8}px,
                ${highlightedRect.right + 8}px ${highlightedRect.top - 8}px,
                ${highlightedRect.right + 8}px ${highlightedRect.bottom + 8}px,
                ${highlightedRect.left - 8}px ${highlightedRect.bottom + 8}px,
                ${highlightedRect.left - 8}px 100%,
                100% 100%,
                100% 0%
              )`
            : 'none',
          pointerEvents: 'auto',
          zIndex: 50000,
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />

      {/* DELETE the "Highlighted area cutout" div - REMOVED */}
      
      {/* Highlight box with glow effect */}
      {highlightedRect && (
        <div
          className="fixed z-[50001] pointer-events-none transition-all duration-300 ease-in-out" // Added transition
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
            transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)' // Smooth transition
          }}
        >
          {currentStepData.requiredInteraction && (
            <div className="absolute inset-0 rounded-lg animate-pulse-glow" />
          )}
        </div>
      )}

      {/* Tutorial tooltip */}
      <div 
        className="tutorial-tooltip fixed z-[50002] bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6 transition-all duration-300 ease-in-out" // Added ease-in-out
        style={{
          ...getTooltipPosition(),
          minWidth: isMobile ? '300px' : '400px',
          maxWidth: isMobile ? '90vw' : '400px',
          transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)' // Add smooth transition
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
                onClick={() => {
                  console.log('🎓 Finish Tour clicked - calling completeTutorial');
                  completeTutorial();
                  // Force immediate cleanup
                  document.body.classList.remove('tutorial-active');
                }}
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