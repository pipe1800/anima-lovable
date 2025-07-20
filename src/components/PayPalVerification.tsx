import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const PayPalVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your subscription...');
  const [isVerifying, setIsVerifying] = useState(false);

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
        console.log('Verification already in progress, skipping...');
        return;
      }
      
      setIsVerifying(true);
      // Get all URL parameters to debug what PayPal is sending
      const allParams = Object.fromEntries(searchParams.entries());
      console.log('All PayPal return parameters:', allParams);
      
      // PayPal can return subscription info in different ways
      const subscriptionId = searchParams.get('subscription_id') || searchParams.get('subscriptionID');
      const token = searchParams.get('token');
      const payerId = searchParams.get('PayerID');
      
      console.log('PayPal verification attempt:', {
        subscription_id: subscriptionId,
        token: token,
        PayerID: payerId,
        allParams
      });

      if (!subscriptionId && !token) {
        console.error('Missing critical parameters:', { subscriptionId, token });
        setStatus('error');
        setMessage('Missing verification parameters from PayPal. Please try subscribing again.');
        return;
      }

      try {
        console.log('Calling paypal-management verify-subscription with:', { subscriptionId, token });
        
        const { data, error } = await supabase.functions.invoke('paypal-management', {
          body: { 
            operation: 'verify-subscription',
            subscriptionId: subscriptionId || token, // Use token as fallback
            token: token
          }
        });

        console.log('Verification response:', { data, error });

        if (error) {
          console.error('Verification error:', error);
          setStatus('error');
          setMessage(`Verification failed: ${error.message || 'Unknown error'}`);
          toast({
            title: "Verification Failed",
            description: `Failed to verify subscription: ${error.message || 'Unknown error'}`,
            variant: "destructive"
          });
          return;
        }

        if (data?.success) {
          setStatus('success');
          const planName = data.subscription?.plan?.name || 'subscription plan';
          setMessage(`Welcome to ${planName}! Your subscription is now active.`);
          toast({
            title: "Subscription Activated!",
            description: `Your ${planName} subscription is now active.`,
          });
          
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
        console.error('Verification error:', error);
        setStatus('error');
        setMessage('An error occurred during verification. Please contact support.');
      } finally {
        setIsVerifying(false);
      }
    };

    verifySubscription();
  }, [searchParams, user, toast, navigate, isVerifying]);

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