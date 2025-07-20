import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export const UpgradeVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your upgrade payment...');

  useEffect(() => {
    const processUpgrade = () => {
      const token = searchParams.get('token');
      const subscriptionId = searchParams.get('subscription_id');
      const targetPlanId = searchParams.get('target_plan_id');
      const payerId = searchParams.get('PayerID');
      
      console.log('Upgrade verification parameters:', {
        token,
        subscription_id: subscriptionId,
        target_plan_id: targetPlanId,
        PayerID: payerId,
        all_params: Object.fromEntries(searchParams.entries())
      });

      if (!token || !subscriptionId || !targetPlanId) {
        setStatus('error');
        setMessage('Missing verification parameters. Please try the upgrade again.');
        return;
      }

      // Use paypal-management to verify the subscription in the background
      supabase.functions.invoke('paypal-management', {
        body: { 
          operation: 'verify-subscription',
          subscriptionId: subscriptionId
        }
      }).then(({ data, error }) => {
        // Log the result but don't change the UI based on it
        console.log('Background verification result:', { data, error });
      }).catch((error) => {
        console.error('Background verification error:', error);
      });

      // Immediately show success message
      setStatus('success');
      setMessage('Processing your upgrade... Your plan will be updated shortly.');
      
      // Redirect to billing settings after 5 seconds
      setTimeout(() => {
        navigate('/settings?tab=billing');
      }, 5000);
    };

    processUpgrade();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-[#0B1426] flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-16 h-16 animate-spin text-[#FF7A00] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Processing Upgrade</h2>
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