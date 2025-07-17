import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const UpgradeVerification = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const query = useQuery();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const processUpgrade = () => {
      // The subscription_id is now in the URL from PayPal's redirect
      const paypalSubscriptionId = query.get('subscription_id');

      if (!paypalSubscriptionId) {
        setErrorMessage("No subscription ID found in URL. Cannot verify upgrade.");
        setStatus('error');
        return;
      }

      // Call the finalize-and-resubscribe function in the background without waiting
      supabase.functions.invoke('finalize-and-resubscribe', {
        body: { subscription_id: paypalSubscriptionId },
      }).then(({ data, error }) => {
        // Log the result but don't change the UI based on it
        console.log('Background finalize-and-resubscribe result:', { data, error });
      }).catch((error) => {
        console.error('Background finalize-and-resubscribe error:', error);
      });

      // Immediately show success message
      setStatus('success');
      
      // Send success message to parent window and close popup
      setTimeout(() => {
        if (window.opener) {
          window.opener.postMessage({ paypal_status: 'success' }, '*');
          window.close();
        } else {
          // Fallback if not in popup
          navigate('/settings?tab=billing');
        }
      }, 7000);
    };

    processUpgrade();
  }, [query, navigate]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-[#FF7A00]" />
            <p className="mt-4 text-white">Finalizing your upgrade...</p>
            <p className="text-gray-400">Please do not close this window.</p>
          </div>
        );
      case 'success':
        return (
          <div className="text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
            <p className="mt-4 text-white text-xl font-bold">Success!</p>
            <p className="text-gray-300">Your upgrade is processing. Your plan will be updated in a few moments.</p>
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