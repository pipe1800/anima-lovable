import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const UpgradeVerification = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const query = useQuery();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'auth-required'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasProcessed, setHasProcessed] = useState(false); // Use a simple flag instead of isProcessing

  useEffect(() => {
    // Wait for user authentication to be determined
    if (user === undefined) {
      // Still loading authentication
      return;
    }
    
    if (!user) {
      setStatus('auth-required');
      setErrorMessage('Please sign in to complete your upgrade verification.');
      return;
    }

    // Prevent multiple executions with a simple flag
    if (hasProcessed) {
      console.log('[UPGRADE-VERIFICATION] Already processed, skipping...');
      return;
    }

    const processUpgrade = async () => {
      setHasProcessed(true); // Set flag immediately to prevent re-runs
      
      try {
        // The subscription_id is now in the URL from PayPal's redirect
        const paypalSubscriptionId = query.get('subscription_id');

        if (!paypalSubscriptionId) {
          setErrorMessage("No subscription ID found in URL. Cannot verify upgrade.");
          setStatus('error');
          return;
        }

        console.log('[UPGRADE-VERIFICATION] Starting upgrade verification with subscription ID:', paypalSubscriptionId);

        // Use paypal-management to verify the subscription
        const { data, error } = await supabase.functions.invoke('paypal-management', {
          body: { 
            operation: 'verify-subscription',
            subscriptionId: paypalSubscriptionId
          }
        });

        console.log('[UPGRADE-VERIFICATION] Verification response:', { data, error });

        if (error) {
          console.error('[UPGRADE-VERIFICATION] Verification error:', error);
          setStatus('error');
          setErrorMessage(`Upgrade verification failed: ${error.message || 'Unknown error'}`);
          return;
        }

        if (data?.success && data?.data?.verified) {
          setStatus('success');
          console.log('[UPGRADE-VERIFICATION] Upgrade verification successful');
          
          // Send success message to parent window and close popup
          setTimeout(() => {
            if (window.opener) {
              window.opener.postMessage({ paypal_status: 'success' }, '*');
              window.close();
            } else {
              // Fallback if not in popup
              navigate('/settings?tab=billing');
            }
          }, 3000);
        } else {
          setStatus('error');
          setErrorMessage('Upgrade verification failed. Please contact support.');
        }
      } catch (error) {
        console.error('[UPGRADE-VERIFICATION] Verification error:', error);
        setStatus('error');
        setErrorMessage('An error occurred during upgrade verification. Please contact support.');
      }
    };

    processUpgrade();
  }, [user]); // Only depend on user, not navigate or query which can change

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-[#FF7A00]" />
            <p className="mt-4 text-white">Verifying your upgrade...</p>
            <p className="text-gray-400">Please do not close this window.</p>
          </div>
        );
      case 'success':
        return (
          <div className="text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
            <p className="mt-4 text-white text-xl font-bold">Upgrade Confirmed!</p>
            <p className="text-gray-300">Your subscription has been successfully upgraded to The Whale plan.</p>
            <p className="text-sm text-gray-400 mt-4">Success! Closing window...</p>
          </div>
        );
      case 'error':
        return (
          <div className="text-center">
            <XCircle className="w-12 h-12 mx-auto text-red-500" />
            <p className="mt-4 text-white text-xl font-bold">Upgrade Failed</p>
            <p className="text-gray-300 bg-gray-800/50 p-2 rounded-md my-2">{errorMessage}</p>
            <Button
              onClick={() => navigate('/settings?tab=billing')}
              className="mt-6"
              variant="outline"
            >
              Back to Billing
            </Button>
          </div>
        );
      case 'auth-required':
        return (
          <div className="text-center">
            <XCircle className="w-12 h-12 mx-auto text-red-500" />
            <p className="mt-4 text-white text-xl font-bold">Authentication Required</p>
            <p className="text-gray-300 bg-gray-800/50 p-2 rounded-md my-2">{errorMessage}</p>
            <Button
              onClick={() => navigate('/auth')}
              className="mt-6 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
            >
              Sign In to Complete Upgrade
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border border-gray-700/50 bg-[#1a1a2e] p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-6">Upgrade Verification</h1>
        {renderContent()}
      </div>
    </div>
  );
};

export default UpgradeVerification;