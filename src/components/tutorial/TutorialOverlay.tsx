import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTutorial } from '@/contexts/TutorialContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import logger from '@/utils/logger';
import { useIsMobile } from '@/hooks/use-mobile';

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
  // Track the currently observed element and its ResizeObserver so we can swap when DOM nodes re-mount
  const observedElRef = useRef<HTMLElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const prevFocusedElRef = useRef<HTMLElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const titleId = 'tutorial-tooltip-title';
  const descId = 'tutorial-tooltip-desc';
  const isMobile = useIsMobile();
  const [waitingForTarget, setWaitingForTarget] = useState(false);
  const highlightedDomRef = useRef<HTMLElement | null>(null);
  const highlightClass = 'tutorial-highlight-target';
  // Allow programmatic UI automation (e.g., clicking sidebar trigger) to bypass interaction blocking
  const automationBypassRef = useRef(false);

  // Prefer visible target; on mobile, prefer elements inside the mobile nav sheet
  const pickVisibleTarget = (selector: string): HTMLElement | null => {
    if (!selector) return null;
    const list = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    if (!list.length) return null;
    const isNonZero = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const mobileSheet = document.querySelector('[data-tutorial="mobile-nav-sheet"]') as HTMLElement | null;
    const candidates = list.filter(isNonZero);
    if (!candidates.length) return null;
    if (mobileSheet) {
      const inSheet = candidates.filter(el => mobileSheet.contains(el));
      if (inSheet.length) return inSheet[0];
    }
    // Fallback: pick the largest visible area
    let best: HTMLElement = candidates[0];
    let bestArea = 0;
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = el; bestArea = area; }
    }
    return best;
  };

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
    if (!currentStepData) return;

    // Reset waiting flag on step change
    setWaitingForTarget(false);

    if (!currentStepData.target) {
      log.debug('🎓 Clearing highlight - step has no target');
      setHighlight(null);
      setHighlightedRect(null);
      return;
    }

    const targetSelector = currentStepData.target;

    let cancelled = false;

    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    const waitFor = async <T,>(fn: () => T | null | undefined, { timeoutMs = 2500, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {}): Promise<T | null> => {
      const start = Date.now();
      while (!cancelled && Date.now() - start < timeoutMs) {
        const v = fn();
        if (v) return v as T;
        await sleep(intervalMs);
      }
      return null;
    };

    (async () => {
      try {
        setWaitingForTarget(true);
        // Enable automation bypass while we manipulate UI (open/close panels, switch tabs)
        automationBypassRef.current = true;

        // Mobile-only: For nav steps (12–14), ensure the right panel is closed and mobile nav is open
        const isNavStepMobile = isMobile && /create-character-nav|discover-nav|world-info-nav/.test(targetSelector);
        let restoreRightPanel = false;
        if (isNavStepMobile) {
          // Close right panel if open
          const panel = document.querySelector('[data-tutorial="right-panel"]') as HTMLElement | null;
          if (panel) {
            const closeBtn = panel.querySelector('button[aria-label="Close panel"]') as HTMLElement | null;
            if (closeBtn) {
              restoreRightPanel = true;
              closeBtn.click();
              await sleep(150);
            }
          }
          // Request mobile nav to open and lock
          const sheet = document.querySelector('[data-tutorial="mobile-nav-sheet"]') as HTMLElement | null;
          if (!sheet) {
            window.dispatchEvent(new Event('tutorial:mobileNav:open'));
            // Wait for it to mount
            await waitFor(() => document.querySelector('[data-tutorial="mobile-nav-sheet"]'), { timeoutMs: 1500, intervalMs: 50 });
            await sleep(120);
          }
         }

         // Ensure right panel is open if this target belongs inside it
        const needsPanel = /persona-section|world-info-section|global-addons-section|core-enhancements|character-tracking|chat-(config|style)-subtab|right-panel-tabs|config-tab/.test(targetSelector);
        if (!isNavStepMobile && needsPanel) {
          let panel = document.querySelector('[data-tutorial="right-panel"]') as HTMLElement | null;
          if (!panel) {
            const toggleBtn = document.querySelector('[data-tutorial="right-panel-toggle"]') as HTMLElement | null;
            toggleBtn?.click();
            panel = await waitFor<HTMLElement>(() => document.querySelector('[data-tutorial="right-panel"]') as HTMLElement | null, { timeoutMs: 2000 });
          }

          // Switch to Config tab ONLY if this step needs Config content
          const needsConfigContent = /persona-section|world-info-section|global-addons-section|core-enhancements|character-tracking|chat-(config|style)-subtab/.test(targetSelector);
          const isConfigTabStep = targetSelector === '[data-tutorial="config-tab"]' && !!currentStepData.requiredInteraction;
          if (needsConfigContent && !isConfigTabStep) {
            const configTabBtn = document.querySelector('[data-tutorial="config-tab"]') as HTMLElement | null;
            if (configTabBtn && !configTabBtn.className.includes('bg-[#FF7A00]')) {
              configTabBtn.click();
              await sleep(120);
            }
          }

          // If the step needs Chat Config content (personas/world/addons), ensure that subtab
          const needsChatSubtab = /persona-section|world-info-section|global-addons-section|core-enhancements|character-tracking/.test(targetSelector);
          if (needsChatSubtab) {
            const chatSubtabBtn = document.querySelector('[data-tutorial="chat-config-subtab"]') as HTMLElement | null;
            if (chatSubtabBtn && !chatSubtabBtn.className.includes('bg-[#FF7A00]')) {
              chatSubtabBtn.click();
              await sleep(120);
            }
          }
        }

        // Now wait for the target element to exist and have a non-zero rect (prefer visible/mobile one)
        const dynamicTimeout = /core-enhancements|character-tracking/.test(targetSelector) ? 6000 : 3000;
        const targetEl = await waitFor<HTMLElement>(() => pickVisibleTarget(targetSelector), { timeoutMs: dynamicTimeout, intervalMs: 50 });

        if (cancelled) return;

        if (targetEl) {
          // Set the highlight only after the element is ready
          setHighlight(targetSelector);

          // Scroll behavior only for panel content; nav items need no scroll
          if (!isNavStepMobile) {
            const rightPanel = document.querySelector('[data-tutorial="right-panel"]') as HTMLElement | null;
            const scrollContainer = rightPanel?.querySelector('.overflow-y-auto') as HTMLElement | null;
            if (scrollContainer && (scrollContainer.contains(targetEl))) {
              const centerTargetInContainer = async () => {
                const containerRect = scrollContainer.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();
                const currentScrollTop = scrollContainer.scrollTop;
                const targetTopInContainer = (targetRect.top - containerRect.top) + currentScrollTop;
                const desiredTop = Math.max(0, targetTopInContainer - (scrollContainer.clientHeight - targetRect.height) / 2);
                const clampedTop = Math.min(
                  Math.max(0, desiredTop),
                  Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
                );
                scrollContainer.scrollTo({ top: clampedTop, behavior: 'smooth' });
              };

              await centerTargetInContainer();
              await sleep(220);
              await centerTargetInContainer();
              await sleep(120);
            }
          }
        } else {
          log.warn('🎓 Target not found in time for selector:', targetSelector);
        }

        // Restore right panel after nav steps if it was open before
        if (isNavStepMobile && restoreRightPanel) {
          const toggleBtn = document.querySelector('[data-tutorial="right-panel-toggle"]') as HTMLElement | null;
          toggleBtn?.click();
          await sleep(150);
        }
      } finally {
        automationBypassRef.current = false;
        if (!cancelled) setWaitingForTarget(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentStepData, setHighlight, log]);

  // Track rect of highlighted element and position tooltip
  useEffect(() => {
    if (!isActive) return;

    let rafId: number | null = null;

    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    const attachResizeObserver = (el: HTMLElement | null) => {
      // Disconnect previous
      if (resizeObserverRef.current) {
        try { resizeObserverRef.current.disconnect(); } catch {}
        resizeObserverRef.current = null;
      }
      if (el) {
        const ro = new ResizeObserver(() => schedule());
        ro.observe(el);
        resizeObserverRef.current = ro;
      }
      observedElRef.current = el;
    };

    const update = () => {
      const selector = currentStepData?.target || '';
      const latestEl = selector ? pickVisibleTarget(selector) : null;

      // If the target node was replaced, re-attach the observer
      if (latestEl !== observedElRef.current) {
        attachResizeObserver(latestEl);
      }

      if (!latestEl) {
        setHighlightedRect(null);
        return;
      }

      const rect = latestEl.getBoundingClientRect();
      // Ignore zero-sized rects
      if (rect.width === 0 && rect.height === 0) {
        setHighlightedRect(null);
      } else {
        setHighlightedRect(rect);
      }
    };

    // Initial run
    update();

    const mo = new MutationObserver(() => schedule());
    mo.observe(document.body, { attributes: true, childList: true, subtree: true });

    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      // Cleanup observers
      if (resizeObserverRef.current) {
        try { resizeObserverRef.current.disconnect(); } catch {}
        resizeObserverRef.current = null;
      }
      observedElRef.current = null;
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [isActive, currentStepData]);

  // Block interactions outside tooltip and highlighted target (only when requiredInteraction)
  useEffect(() => {
    if (!isActive || !currentStepData) return;

    const tooltipEl = tooltipRef.current;

    const shouldBlockOutside = !!currentStepData.requiredInteraction;
    const shouldBlockTarget = !!currentStepData.preventTargetInteraction;

    const getCurrentTargetEl = () => {
      const selector = currentStepData?.target || '';
      return selector ? pickVisibleTarget(selector) : null;
    };

    // When we are focusing nav steps on mobile, allow the mobile sheet area to receive events
    const mobileSheetEl = document.querySelector('[data-tutorial="mobile-nav-sheet"]') as HTMLElement | null;

    const allow = (node: EventTarget | null) => {
      if (!node) return false;
      // If we are running automation, do not block any events
      if (automationBypassRef.current) return true;
      const n = node as Node;
      const targetElNow = getCurrentTargetEl(); // query live each event to avoid stale nodes
      // If target clicks are disabled, do NOT allow inside target
      if (shouldBlockTarget && targetElNow && targetElNow.contains(n)) return false;
      if (tooltipEl && tooltipEl.contains(n)) return true;
      if (mobileSheetEl && mobileSheetEl.contains(n)) return true;
      if (targetElNow && targetElNow.contains(n)) return true;
      return !shouldBlockOutside; // if not blocking outside, allow others
    };

    const block = (e: Event) => {
      if (allow(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const events: Array<keyof DocumentEventMap> = [
      'click',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'touchstart',
      'touchend',
      'contextmenu'
    ];

    events.forEach(evt => document.addEventListener(evt, block, true));
    return () => {
      events.forEach(evt => document.removeEventListener(evt, block, true));
    };
  }, [isActive, currentStepData]);

  // Auto-advance on target click for requiredInteraction steps (robust across re-renders/back navigation)
  useEffect(() => {
    if (!isActive || !currentStepData?.requiredInteraction || !currentStepData.target || currentStepData.preventTargetInteraction) return;

    const stepIndexAtBind = currentStep; // capture to avoid double-advance
    const selectorAtBind = currentStepData.target;

    const handleCaptureClick = (e: MouseEvent | TouchEvent) => {
      const targetEl = pickVisibleTarget(selectorAtBind);
      if (!targetEl) return;
      const node = e.target as Node | null;
      if (node && targetEl.contains(node)) {
        // Let the app handle the click, then advance if still on the same step
        setTimeout(() => {
          if (!isActive) return;
          // Only advance if we are still on the same step and it still requires interaction
          if (currentStep === stepIndexAtBind && currentStepData?.requiredInteraction) {
            try { nextStep(); } catch {}
          }
        }, 120);
      }
    };

    document.addEventListener('click', handleCaptureClick, true);
    document.addEventListener('touchend', handleCaptureClick, true);
    return () => {
      document.removeEventListener('click', handleCaptureClick, true);
      document.removeEventListener('touchend', handleCaptureClick, true);
    };
  }, [isActive, currentStepData, nextStep, currentStep]);

  // Keyboard navigation: Esc to skip, ← to back, → to next (unless action required)
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        skipTutorial();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        previousStep();
      } else if (e.key === 'ArrowRight') {
        if (!currentStepData?.requiredInteraction) {
          e.preventDefault();
          nextStep();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isActive, currentStepData?.requiredInteraction, nextStep, previousStep, skipTutorial]);

  // Ensure sidebar is visible for navigation steps
  useEffect(() => {
    if (!isActive) return;

    const t = currentStepData?.target || '';
    const isNavStep = t.includes('-nav"]');
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

  // Lock/unlock the mobile nav sheet during mobile nav steps to prevent flicker/auto-close
  useEffect(() => {
    if (!isActive) return;
    const targetSelector = currentStepData?.target || '';
    const isNavStepMobile = isMobile && /create-character-nav|discover-nav|world-info-nav/.test(targetSelector);
    if (isNavStepMobile) {
      // Request open and lock
      window.dispatchEvent(new Event('tutorial:mobileNav:open'));
    } else {
      // Allow closing when not on a nav step
      window.dispatchEvent(new Event('tutorial:mobileNav:unlock'));
    }
    return () => {
      // On unmount or step change, if leaving a nav step, ensure unlock
      if (!isNavStepMobile) {
        window.dispatchEvent(new Event('tutorial:mobileNav:unlock'));
      }
    };
  }, [isActive, isMobile, currentStepData?.target]);

  const getTooltipPosition = () => {
    const center = {
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)'
    } as const;

    // Force center when no target or no rect
    if (!currentStepData.target || !highlightedRect) {
      return center as any;
    }

    // Mobile-safe placement: avoid overlapping the highlighted element
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const tooltipWidth = isMobile ? Math.min(Math.floor(viewportWidth * 0.92), 360) : 400;
    const estTooltipHeight = isMobile ? 280 : 320;

    if (isMobile) {
      const spaceTop = Math.max(0, highlightedRect.top - margin);
      const spaceBottom = Math.max(0, viewportHeight - highlightedRect.bottom - margin);

      // Prefer placing below if enough space, else above
      if (spaceBottom >= estTooltipHeight) {
        return {
          top: highlightedRect.bottom + margin,
          left: Math.max(margin, Math.min(highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2, viewportWidth - tooltipWidth - margin)),
          right: 'auto',
          bottom: 'auto',
          transform: 'none',
          maxHeight: spaceBottom,
        } as const;
      }
      if (spaceTop >= estTooltipHeight) {
        return {
          top: Math.max(margin, highlightedRect.top - estTooltipHeight - margin),
          left: Math.max(margin, Math.min(highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2, viewportWidth - tooltipWidth - margin)),
          right: 'auto',
          bottom: 'auto',
          transform: 'none',
          maxHeight: spaceTop,
        } as const;
      }
      // Not enough space either side: choose the larger side and clamp height
      if (spaceBottom >= spaceTop) {
        return {
          top: highlightedRect.bottom + margin,
          left: Math.max(margin, Math.min(highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2, viewportWidth - tooltipWidth - margin)),
          right: 'auto',
          bottom: 'auto',
          transform: 'none',
          maxHeight: Math.max(160, spaceBottom),
        } as const;
      }
      return {
        top: Math.max(margin, highlightedRect.top - Math.max(160, Math.min(estTooltipHeight, spaceTop)) - margin),
        left: Math.max(margin, Math.min(highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2, viewportWidth - tooltipWidth - margin)),
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
        maxHeight: Math.max(160, spaceTop),
      } as const;
    }

    if (!currentStepData.position) {
      return center as any;
    }

    let top = 0;
    let left = 0;

    switch (currentStepData.position) {
      case 'left':
        top = highlightedRect.top + highlightedRect.height / 2 - estTooltipHeight / 2;
        left = highlightedRect.left - tooltipWidth - margin;
        if (left < margin) left = highlightedRect.right + margin;
        break;
      case 'right':
        top = highlightedRect.top + highlightedRect.height / 2 - estTooltipHeight / 2;
        left = highlightedRect.right + margin;
        if (left + tooltipWidth > viewportWidth - margin) left = highlightedRect.left - tooltipWidth - margin;
        break;
      case 'top':
        top = highlightedRect.top - estTooltipHeight - margin;
        left = highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2;
        if (top < margin) top = highlightedRect.bottom + margin;
        break;
      case 'bottom':
      default:
        top = highlightedRect.bottom + margin;
        left = highlightedRect.left + highlightedRect.width / 2 - tooltipWidth / 2;
        if (top + estTooltipHeight > viewportHeight - margin) top = highlightedRect.top - estTooltipHeight - margin;
        break;
    }

    // Guard invalid numbers
    if (!Number.isFinite(top) || !Number.isFinite(left)) {
      return center as any;
    }

    // Final clamp
    left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin));
    top = Math.max(margin, Math.min(top, viewportHeight - estTooltipHeight - margin));

    return { top, left, right: 'auto', bottom: 'auto', transform: 'none' } as const;
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
    return createPortal(
      <div className="tutorial-overlay" ref={overlayRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50000 }}>
        {/* Dark overlay */}
        <div 
          className="fixed inset-0 bg-black/80 z-[50000]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        {/* Centered completion message */}
        <div className="fixed inset-0 flex items-center justify-center z-[50002]" style={{ pointerEvents: 'auto' }}>
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
      </div>,
      document.body
    );
  }

  // Dark overlay: render four-quadrant shields with asymmetric padding to avoid exposing adjacent borders above the target
  return createPortal(
    <div className="tutorial-overlay" ref={overlayRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50000 }}>
      {!highlightedRect ? (
        <div className="fixed inset-0 bg-black/80 pointer-events-none z-[50000]" />
      ) : (
        <>
          {(() => {
            const padTop = 0; // no gutter — cutout is flush with target
            const padBottom = 0;
            const padLeft = 0;
            const padRight = 0;

            const vw = window.innerWidth;
            const vh = window.innerHeight;
            // Clamp padded rect to viewport with integer rounding to avoid subpixel bleed
            const top = Math.max(0, Math.floor(highlightedRect.top - padTop));
            const left = Math.max(0, Math.floor(highlightedRect.left - padLeft));
            const bottom = Math.min(vh, Math.ceil(highlightedRect.bottom + padBottom));
            const right = Math.min(vw, Math.ceil(highlightedRect.right + padRight));

            return (
              <>
                {/* Top mask */}
                <div
                  className="fixed bg-black/80 z-[50000] pointer-events-none"
                  style={{ top: 0, left: 0, right: 0, height: top, transform: 'translateZ(0)' }}
                />
                {/* Bottom mask */}
                <div
                  className="fixed bg-black/80 z-[50000] pointer-events-none"
                  style={{ top: bottom, left: 0, right: 0, bottom: 0, transform: 'translateZ(0)' }}
                />
                {/* Left mask */}
                <div
                  className="fixed bg-black/80 z-[50000] pointer-events-none"
                  style={{ top, left: 0, width: left, height: bottom - top, transform: 'translateZ(0)' }}
                />
                {/* Right mask */}
                <div
                  className="fixed bg-black/80 z-[50000] pointer-events-none"
                  style={{ top, left: right, right: 0, height: bottom - top, transform: 'translateZ(0)' }}
                />
              </>
            );
          })()}
        </>
      )}

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
        aria-describedby={descId}
        tabIndex={-1}
        className="tutorial-tooltip bg-[#1a1a2e] border-2 border-[#FF7A00] rounded-lg shadow-2xl p-6"
        style={{
          position: 'fixed',
          ...getTooltipPosition(),
          width: isMobile ? 'min(92vw, 360px)' : '400px',
          maxHeight: isMobile ? '45vh' : undefined,
          overflowY: 'auto',
          transition: reduceMotion ? 'none' : 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: (waitingForTarget || highlightedRect || !currentStepData.target) ? 1 : 0,
          pointerEvents: 'auto',
          zIndex: 50002
        }}
      >
        {/* Live region for screen readers */}
        <div className="sr-only" aria-live="polite">
          Step {currentStep + 1} of {tutorialSteps.length}: {currentStepData.title}
        </div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id={titleId} className="text-white font-bold text-lg pr-4">{currentStepData.title}</h3>
          <Button
            aria-label="Skip tutorial"
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
          <p id={descId} className="text-gray-300 mb-3">{currentStepData.description}</p>
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
            <div>Step {currentStep + 1} of {tutorialSteps.length}</div>

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
            className="h-full bg-[#FF7A00]"
            style={{ 
              width: `${((currentStep + 1) / tutorialSteps.length) * 100}%`,
              transition: reduceMotion ? 'none' : 'width 300ms ease'
            }}
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
          .animate-pulse { animation: none !important; }
        }
      `}</style>
    </div>,
    document.body
  );
};