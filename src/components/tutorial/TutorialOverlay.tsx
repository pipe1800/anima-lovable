import React, { useEffect, useState, useRef } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import logger from '@/utils/logger';

export const TutorialOverlay: React.FC = () => {
  const log = logger.scoped('TutorialOverlay');
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const prevFocusedElRef = useRef<HTMLElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const titleId = 'tutorial-tooltip-title';

  useEffect(() => {
    // Track prefers-reduced-motion
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    // Save previously focused element and move focus to tooltip
    prevFocusedElRef.current = (document.activeElement as HTMLElement) || null;
    // Focus tooltip after render
    const t = setTimeout(() => {
      tooltipRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [isActive, currentStep]);

  // Restore focus when tutorial ends
  useEffect(() => {
    if (!isActive && prevFocusedElRef.current) {
      const el = prevFocusedElRef.current;
      if (document.contains(el)) {
        try { el.focus(); } catch {}
      }
      prevFocusedElRef.current = null;
    }
  }, [isActive]);

  useEffect(() => {
    log.debug('🎓 TutorialOverlay: Rendering/updated', {/* redacted debug to avoid heavy objects */});
  }, [/* deps causing re-render */]);

  // MOVE THE isActive CHECK TO THE TOP OF THE COMPONENT
  // This should be the FIRST check in the render
  if (!isActive) {
    log.debug('🎓 TutorialOverlay: Tutorial not active, unmounting');
    return null;
  }

  // Add this after the console.log at line 27
  useEffect(() => {
    log.debug('🎓 ALL TUTORIAL STEPS (titles only):', tutorialSteps.map((step, idx) => ({
      step: idx,
      title: step.title,
      target: step.target,
      requiredInteraction: step.requiredInteraction
    })));
  }, [tutorialSteps, log]);

  // FIX 1: PROPERLY clear highlight when step has no target
  useEffect(() => {
    if (currentStepData) {
      if (currentStepData.target) {
        log.debug('🎓 Setting highlight to:', currentStepData.target);

        // Ensure correct right panel subtab is active based on target
        const needsChatSubtab = /persona-section|world-info-section|global-addons-section/.test(currentStepData.target);
        const needsStyleSubtab = /chat-style-subtab/.test(currentStepData.target);
        if (needsChatSubtab) {
          const btn = document.querySelector('[data-tutorial="chat-config-subtab"]') as HTMLElement | null;
          // Only click if not already active (check class)
          if (btn && !btn.className.includes('bg-[#FF7A00]')) {
            setTimeout(() => btn.click(), 50);
          }
        } else if (needsStyleSubtab) {
          const btn = document.querySelector('[data-tutorial="chat-style-subtab"]') as HTMLElement | null;
          if (btn && !btn.className.includes('bg-[#FF7A00]')) {
            setTimeout(() => btn.click(), 50);
          }
        }

        setHighlight(currentStepData.target);
        
        if (currentStepData.scrollTo) {
          // Scroll within right panel if target is inside it
          const targetEl = document.querySelector(currentStepData.target) as HTMLElement | null;
          const rightPanel = document.querySelector('[data-tutorial="right-panel"]') as HTMLElement | null;
          const scrollContainer = rightPanel?.querySelector('.overflow-y-auto') as HTMLElement | null;
          const container = scrollContainer ?? document.scrollingElement ?? document.documentElement;
          if (targetEl) {
            const top = (scrollContainer ? targetEl.offsetTop : targetEl.getBoundingClientRect().top + window.scrollY) - 100;
            (container as any).scrollTo?.({ top, behavior: 'smooth' });
          }
        }
        
        if (currentStepData.target?.includes('right-panel-tabs') || currentStepData.target?.includes('config-tab')) {
          setTimeout(() => {
            const element = document.querySelector(currentStepData.target!);
            element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 400);
        }
      } else {
        log.debug('🎓 Clearing highlight - step has no target');
        setHighlight(null);
        setHighlightedRect(null);
      }
    }
  }, [currentStepData, setHighlight, log]);

  // Ensure sidebar is visible for navigation steps
  useEffect(() => {
    if (!isActive) return;

    const isNavStep = !!currentStepData?.target && /-(nav)"\]$/.test(currentStepData.target);
    if (isNavStep) {
      const sidebarCollapsed = localStorage.getItem('sidebarCollapsed');
      if (sidebarCollapsed === 'true') {
        localStorage.setItem('sidebarCollapsed', 'false');
        window.dispatchEvent(new CustomEvent('sidebarToggled'));
        return () => {
          if (sidebarCollapsed === 'true') {
            localStorage.setItem('sidebarCollapsed', 'true');
            window.dispatchEvent(new CustomEvent('sidebarToggled'));
          }
        };
      }
    }
  }, [isActive, currentStepData]);

  useEffect(() => {
    if (!highlightedElement) {
      setHighlightedRect(null);
      return;
    }

    let raf = 0;
    const updateRect = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const element = document.querySelector(highlightedElement);
        if (element) {
          setHighlightedRect(element.getBoundingClientRect());
        } else {
          setHighlightedRect(null);
        }
      });
    };

    // Initial
    updateRect();

    // Observe size/position changes without causing thrash
    const element = document.querySelector(highlightedElement) as HTMLElement | null;
    const ro = element ? new ResizeObserver(updateRect) : null;
    ro?.observe(element!);

    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    const mo = new MutationObserver(updateRect);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    document.addEventListener('transitionend', updateRect);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
      document.removeEventListener('transitionend', updateRect);
      mo.disconnect();
      ro?.disconnect();
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
              log.debug('🎓 Tutorial: Click on highlighted element - allowing through');
              // Don't prevent default - let the click go through
              
              // If this step requires interaction, advance after a delay
              if (currentStepData?.requiredInteraction) {
                setTimeout(() => {
                  log.debug('🎓 Tutorial: Advancing to next step after interaction');
                  nextStep();
                }, 500);
              }
              return;
            }
            clickedElement = clickedElement.parentNode as Node;
          }
        }
      }

      // Check if click is on the tutorial tooltip itself
      const tooltipElement = document.querySelector('.tutorial-tooltip');
      if (tooltipElement && tooltipElement.contains(e.target as Node)) {
        log.debug('🎓 Tutorial: Click on tooltip, allowing interaction');
        return;
      }

      // Check if click is on "Finish Tour" button in completion screen
      const finishTourButton = (e.target as Element).closest('button');
      if (finishTourButton && finishTourButton.textContent?.includes('Finish Tour')) {
        log.debug('🎓 Tutorial: Click on Finish Tour button, allowing interaction');
        return;
      }

      // Block all other clicks
      log.debug('🎓 Tutorial: Blocking click outside highlighted area');
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
  }, [isActive, highlightedElement, currentStepData, nextStep, log]);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTutorial();
        return;
      }
      // Trap focus within tooltip
      if (e.key === 'Tab' && tooltipRef.current) {
        const focusables = tooltipRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
          return;
        }
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
          return;
        }
      }
      // Arrow navigation only when interaction not required
      if (e.key === 'ArrowRight' && !currentStepData?.requiredInteraction) {
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
        
        log.debug('🎓 Applied high z-index to highlighted element:', highlightedElement);
        
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
    log.debug('🎓 TutorialOverlay: No step data');
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
  log.debug('🎓 TutorialOverlay: Step check:', {
    currentStep,
    tutorialStepsLength: tutorialSteps.length,
    isFinalStep: currentStep === tutorialSteps.length - 1,
    // Avoid logging large currentStepData object in production
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
                log.info('🎓 Finish Tour clicked - calling completeTutorial');
                completeTutorial();
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
          className="fixed z-[50001] pointer-events-none"
          style={{
            top: highlightedRect.top - 4,
            left: highlightedRect.left - 4,
            width: highlightedRect.width + 8,
            height: highlightedRect.height + 8,
            border: '2px solid #FF7A00',
            borderRadius: '8px',
            boxShadow: currentStepData.requiredInteraction 
              ? '0 0 0 4px rgba(255, 122, 0, 0.25), 0 0 24px rgba(255, 122, 0, 0.5), inset 0 0 16px rgba(255, 122, 0, 0.2)'
              : '0 0 0 4px rgba(255, 122, 0, 0.25), 0 0 16px rgba(255, 122, 0, 0.4)',
            transition: reduceMotion ? 'none' : 'transform 200ms ease-out, top 200ms ease-out, left 200ms ease-out, width 200ms ease-out, height 200ms ease-out'
          }}
        >
          {currentStepData.requiredInteraction && !reduceMotion && (
            <div className="absolute inset-0 rounded-lg animate-pulse-glow" />
          )}
        </div>
      )}

      {/* Tutorial tooltip */}
      <div 
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="tutorial-tooltip fixed z-[50002] bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6"
        style={{
          ...getTooltipPosition(),
          minWidth: isMobile ? '300px' : '400px',
          maxWidth: isMobile ? '90vw' : '400px',
          transition: reduceMotion ? 'none' : 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: highlightedRect || !currentStepData.target ? 1 : 0
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id={titleId} className="text-white font-bold text-lg pr-4">{currentStepData.title}</h3>
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
                  log.info('🎓 Finish Tour clicked - calling completeTutorial');
                  completeTutorial();
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
        
        /* Reduced motion: disable animations */
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse-glow { animation: none !important; }
        }
      `}</style>
    </div>
  );
};