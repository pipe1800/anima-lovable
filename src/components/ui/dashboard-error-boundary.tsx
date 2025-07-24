import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class DashboardErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Dashboard error:', error, errorInfo);
    
    // Log to external service if available
    if (process.env.NODE_ENV === 'production') {
      // You can integrate with error reporting services like Sentry here
      console.error('Production error logged:', error.message);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent 
            error={this.state.error!} 
            resetError={this.resetError} 
          />
        );
      }

      return (
        <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-4">
              <AlertCircle className="w-16 h-16 text-red-400" />
            </div>
            
            <h2 className="text-red-400 text-xl font-semibold mb-2">
              Something went wrong
            </h2>
            
            <div className="text-gray-400 text-sm mb-6 space-y-2">
              <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
              <p className="text-xs text-gray-500">
                Please try refreshing the page or contact support if the problem persists.
              </p>
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button
                onClick={this.resetError}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Try Again
              </Button>
              
              <Button
                onClick={() => window.location.reload()}
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useDashboardErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error) => {
    console.error('Dashboard error caught:', error);
    setError(error);
  }, []);

  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      setError(new Error(event.reason?.message || 'Unhandled promise rejection'));
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return {
    error,
    resetError,
    handleError,
    hasError: !!error
  };
}
