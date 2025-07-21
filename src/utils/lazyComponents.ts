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
  // Virtual scrolling for very large chats
  virtualScrolling: () => import('react-window').then(module => module.FixedSizeList),
  
  // File upload for message attachments
  fileUpload: () => import('../components/chat/FileUpload'),
  
  // Voice messages
  voiceMessages: () => import('../components/chat/VoiceMessages'),
  
  // Message search
  messageSearch: () => import('../components/chat/MessageSearch'),
} as const;

// ============================================================================
// PRELOADING STRATEGIES
// ============================================================================

export const preloadChatFeatures = {
  // Preload context display when user enables addons
  contextDisplay: () => {
    if (typeof window !== 'undefined') {
      // Preload when user is likely to use it
      const timer = setTimeout(() => {
        import('../components/chat/ContextDisplay');
      }, 2000);
      return () => clearTimeout(timer);
    }
  },
  
  // Preload performance monitor for power users
  performanceMonitor: () => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      import('../components/chat/PerformanceMonitor');
    }
  },
} as const;

// ============================================================================
// COMPONENT SIZE HELPERS
// ============================================================================

export const componentSizes = {
  // Estimated component sizes for bundle analysis
  contextDisplay: '~2KB',
  addonDebugPanel: '~5KB', 
  performanceMonitor: '~3KB',
  databaseBatchOperations: '~4KB',
  
  // Total savings from lazy loading
  totalSavings: '~14KB',
} as const;
