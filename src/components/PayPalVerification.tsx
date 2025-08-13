import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logger from '@/utils/logger';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/chatQueries';

export const PayPalVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your subscription...');
  const [isVerifying, setIsVerifying] = useState(false);
  const queryClient = useQueryClient();
  const log = logger.scoped('PayPalVerification');

  useEffect(() => {
    // Wait for user authentication to be determined
    if (user === undefined) {
      // Still loading authentication, keep showing loading state
      setStatus('loading');
      setMessage('Authenticating...');
      return;
    }
    
    if (!user) {
      setStatus('error');
      setMessage('You must be logged in to verify your subscription.');
      return;
    }

    const verifySubscription = async () => {
      // Prevent duplicate calls
      if (isVerifying) {
        log.debug('Verification already in progress, skipping...');
        return;
      }
      
      setIsVerifying(true);
      // Get all URL parameters to debug what PayPal is sending
      const allParams = Object.fromEntries(searchParams.entries());
      log.info('All PayPal return parameters:', allParams);
      
      // PayPal can return subscription info in different ways
      const subscriptionId = searchParams.get('subscription_id') || searchParams.get('subscriptionID');
      const token = searchParams.get('token');
      const payerId = searchParams.get('PayerID');
      
      log.info('PayPal verification attempt:', {
        subscription_id: subscriptionId,
        token: token,
        PayerID: payerId,
        allParams
      });

      if (!subscriptionId && !token) {
        setStatus('error');
        setMessage('Missing verification parameters.');
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('paypal-management', {
          body: { 
            operation: 'verify-subscription',
            subscriptionId: subscriptionId || token
          }
        });

        log.debug('Verification response:', { data, error });

        if (error) {
          log.error('Verification error:', error);
          setStatus('error');
          setMessage('Verification failed. Please contact support.');
          return;
        }

        if (data?.success && (data?.data?.verified || data?.verified)) {
          setStatus('success');
          const planName = data.subscription?.plan?.name || 'subscription plan';
          setMessage(`Welcome to ${planName}! Your subscription is now active.`);
          toast({
            title: "Subscription Activated!",
            description: `Your ${planName} subscription is now active.`,
          });

          // Invalidate user credits/profile to reflect new plan/credits
          if (user?.id) {
            queryClient.invalidateQueries({ queryKey: queryKeys.user.credits(user.id), exact: true });
            queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(user.id), exact: true });
          }
          
          // Send success message to parent window and close popup
          setTimeout(() => {
            if (window.opener) {
              window.opener.postMessage({ paypal_status: 'success' }, '*');
              window.close();
            } else {
              // Fallback if not in popup
              navigate('/settings?tab=billing');
            }
          }, 2000);
        } else {
          setStatus('error');
          setMessage('Subscription verification failed. Please contact support.');
        }
      } catch (error) {
        log.error('Verification error:', error);
        setStatus('error');
        setMessage('An error occurred during verification. Please contact support.');
      } finally {
        setIsVerifying(false);
      }
    };

    verifySubscription();
  }, [searchParams, user, toast, navigate, isVerifying, log, queryClient]);

  const getIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="w-16 h-16 animate-spin text-[#FF7A00]" />;
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-500" />;
      case 'error':
        return <XCircle className="w-16 h-16 text-red-500" />;
    }
  };

  const getBackgroundColor = () => {
    switch (status) {
      case 'success':
        return 'bg-green-500/10 border-green-500/20';
      case 'error':
        return 'bg-red-500/10 border-red-500/20';
      default:
        return 'bg-[#FF7A00]/10 border-[#FF7A00]/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div className={`max-w-md w-full rounded-lg border p-8 text-center ${getBackgroundColor()}`}>
        <div className="flex justify-center mb-6">
          {getIcon()}
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-4">
          {status === 'loading' && 'Verifying Subscription'}
          {status === 'success' && 'Subscription Confirmed!'}
          {status === 'error' && 'Verification Failed'}
        </h1>
        
        <p className="text-gray-300 mb-6">
          {message}
        </p>

        {status === 'success' && (
          <p className="text-sm text-gray-400 mb-4">
            Success! Closing window...
          </p>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <Button 
              onClick={() => navigate('/subscription')}
              className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
            >
              Return to Subscription Page
            </Button>
            <Button 
              onClick={() => navigate('/settings/billing')}
              variant="outline"
              className="w-full border-gray-600 text-white hover:bg-gray-800"
            >
              Contact Support
            </Button>
          </div>
        )}

      </div>
    </div>
  );
};