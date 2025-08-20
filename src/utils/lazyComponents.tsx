import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Phase 3 Performance Optimization: Lazy Component Loading
 * 
 * Benefits:
 * - Reduced initial bundle size
 * - Faster first page load
 * - Code splitting for better caching
 * - Progressive loading of features
 */

// ============================================================================
// LOADING FALLBACKS - Optimized loading states
// ============================================================================

const SmallSpinner = () => {
  return (
    <div className="flex items-center justify-center p-2">
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    </div>
  );
};

const MediumSpinner = () => {
  return (
    <div className="flex items-center justify-center p-4">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
};

// ============================================================================
// LAZY COMPONENT CREATORS
// ============================================================================

export const createLazyComponent = (importFn: () => Promise<{ default: ComponentType<any> }>) => {
  return lazy(importFn);
};

export const createLazyWrapper = (
  LazyComponent: ComponentType<any>, 
  fallback = <SmallSpinner />
) => {
  return (props: any) => (
    <Suspense fallback={fallback}>
      <LazyComponent {...props} />
    </Suspense>
  );
};

// ============================================================================
// DYNAMIC IMPORTS FOR HEAVY FEATURES
// ============================================================================

export const loadChatFeatures = {
  // Context display for AI conversations
  contextDisplay: () => import('../components/chat/ContextDisplay'),
  // Performance monitoring for optimization
  performanceMonitor: () => import('../components/chat/PerformanceMonitor'),
} as const;

// ============================================================================
// PRELOADING STRATEGIES
// ============================================================================

export const preloadChatFeatures = {
  // Preload context display when user is engaged
  contextDisplay: () => {
    if (typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        import('../components/chat/ContextDisplay');
      }, 3000);
      return () => clearTimeout(timer);
    }
  },
} as const;

// ============================================================================
// COMPONENT SIZE HELPERS
// ============================================================================

export const componentSizes = {
  contextDisplay: '~2KB',
  performanceMonitor: '~3KB',
  totalSavings: '~5KB',
} as const;
