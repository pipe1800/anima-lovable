
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
    
    // If it's an auth-related error, clear storage
    if (error.message?.includes('auth') || 
        error.message?.includes('session') || 
        error.message?.includes('token') ||
        error.stack?.includes('AuthContext')) {
      console.log('Auth-related error detected, clearing storage...');
      this.clearAuthStorage();
    }
  }

  private clearAuthStorage = () => {
    try {
      // Clear all auth-related storage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('sb-') || 
          key.includes('supabase') || 
          key.includes('auth') ||
          key.includes('session') ||
          key.includes('token')
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      // Also clear sessionStorage
      const sessionKeysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (
          key.startsWith('sb-') || 
          key.includes('supabase') || 
          key.includes('auth') ||
          key.includes('session') ||
          key.includes('token')
        )) {
          sessionKeysToRemove.push(key);
        }
      }
      
      sessionKeysToRemove.forEach(key => {
        sessionStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Failed to clear auth storage:', error);
    }
  };

  private handleRefresh = () => {
    // Clear storage before refresh
    this.clearAuthStorage();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-[#121212] flex items-center justify-center">
          <div className="text-center text-white p-8 max-w-md">
            <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
            <p className="text-gray-400 mb-6">
              We detected an issue with your session. This usually happens when browser storage gets corrupted.
            </p>
            <div className="space-y-3">
              <button 
                onClick={this.handleRefresh}
                className="w-full bg-[#FF7A00] text-white px-4 py-2 rounded hover:bg-[#FF7A00]/80 transition-colors"
              >
                Clear Data & Refresh
              </button>
              <p className="text-xs text-gray-500">
                This will clear your browser storage and reload the page
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
