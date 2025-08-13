import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import logger from '@/utils/logger';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/chatQueries';

export const UpgradeCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const log = logger.scoped('UpgradeCallback');
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Completing your subscription upgrade...');

  useEffect(() => {
    const processUpgrade = async () => {
      const subscriptionId = searchParams.get('subscriptionId');
      const token = searchParams.get('token');

      if (!subscriptionId || !token) {
        setStatus('error');
        setMessage('Missing upgrade parameters. Please contact support.');
        return;
      }

      try {
        log.info('Using paypal-management to verify subscription upgrade');

        const { data, error } = await supabase.functions.invoke('paypal-management', {
          body: { 
            operation: 'verify-subscription',
            subscriptionId: subscriptionId
          }
        });

        log.debug('Function response:', { data, error });

        if (error) {
          log.error('Function error:', error);
          throw new Error(`Edge Function Error: ${error.message}`);
        }

        if (data?.success && data?.data?.verified) {
          setStatus('success');
          const creditsText = data.creditsAdded ? ` and received ${data.creditsAdded.toLocaleString()} additional credits` : '';
          
          setMessage(`Upgrade complete! You've been upgraded to ${data.newPlan || 'your new plan'}${creditsText}. Your PayPal subscription has been updated.`);

          // Invalidate credits/profile to reflect new plan/credits
          // Redirect to settings after 3 seconds
          setTimeout(() => {
            navigate('/settings?tab=billing');
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Could not verify your upgrade. Please contact support.');
        }
      } catch (err: any) {
        log.error('Upgrade verification failed:', err);
        setStatus('error');
        setMessage(err.message || 'Unexpected error during upgrade verification.');
      }
    };

    processUpgrade();
  }, [searchParams, navigate, queryClient, log]);

  return (
    <div className="min-h-screen bg-[#0B1426] flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 animate-spin text-[#FF7A00] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Completing Upgrade</h2>
            <p className="text-gray-300">{message}</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Upgrade Complete!</h2>
            <p className="text-gray-300 mb-4">{message}</p>
            <p className="text-sm text-gray-400">Redirecting you to billing settings...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Upgrade Failed</h2>
            <p className="text-gray-300 mb-4">{message}</p>
            <button
              onClick={() => navigate('/settings?tab=billing')}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Back to Billing Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
};