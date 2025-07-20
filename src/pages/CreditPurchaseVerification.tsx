import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CreditPurchaseVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Finalizing your credit purchase...');
  const [isVerifying, setIsVerifying] = useState(false);
  const [purchaseDetails, setPurchaseDetails] = useState<{
    creditPack?: string;
    creditsAdded?: number;
    amountPaid?: number;
  }>({});

  useEffect(() => {
    const finalizePurchase = async () => {
      // Prevent duplicate calls
      if (isVerifying) {
        console.log('Verification already in progress, skipping...');
        return;
      }
      
      setIsVerifying(true);
      
      // Get all URL parameters to debug what PayPal is sending
      const allParams = Object.fromEntries(searchParams.entries());
      console.log('All PayPal return parameters:', allParams);
      
      // PayPal returns the order token as 'token' parameter
      const token = searchParams.get('token');
      const payerId = searchParams.get('PayerID');
      const packId = searchParams.get('pack_id');
      
      console.log('Credit purchase verification attempt:', {
        token: token,
        PayerID: payerId,
        pack_id: packId,
        allParams
      });

      if (!token) {
        console.error('Missing token parameter:', { token });
        setStatus('error');
        setMessage('Missing order token from PayPal. Please try your purchase again.');
        return;
      }

      try {
        console.log('Calling paypal-management with capture-order operation:', { orderId: token, packId });
        
        // We need to get the credit pack ID from the pack_id parameter
        if (!packId) {
          throw new Error('Missing credit pack ID parameter');
        }
        
        const { data, error } = await supabase.functions.invoke('paypal-management', {
          body: { 
            operation: 'capture-order',
            orderID: token,
            creditPackId: packId
          }
        });

        console.log('Capture response:', { data, error });

        if (error) {
          console.error('Capture error:', error);
          setStatus('error');
          setMessage(`Purchase finalization failed: ${error.message || 'Unknown error'}`);
          toast({
            title: "Purchase Failed",
            description: `Failed to finalize credit purchase: ${error.message || 'Unknown error'}`,
            variant: "destructive"
          });
          return;
        }

        if (data?.success) {
          setStatus('success');
          setPurchaseDetails({
            creditPack: data.data?.creditPack,
            creditsAdded: data.data?.creditsGranted,
            amountPaid: data.data?.amountPaid
          });
          setMessage(`Success! ${data.data?.creditsGranted?.toLocaleString()} credits have been added to your account.`);
          toast({
            title: "Credits Purchased!",
            description: `${data.data?.creditsGranted?.toLocaleString()} credits have been added to your account.`,
          });
          
          // Send success message to parent window and close popup
          setTimeout(() => {
            if (window.opener) {
              window.opener.postMessage({ paypal_status: 'success' }, '*');
              window.close();
            } else {
              // Fallback if not in popup
              navigate('/subscription');
            }
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Credit purchase finalization failed. Please contact support.');
        }
      } catch (error) {
        console.error('Finalization error:', error);
        setStatus('error');
        setMessage('An error occurred during purchase finalization. Please contact support.');
      } finally {
        setIsVerifying(false);
      }
    };

    if (user) {
      finalizePurchase();
    } else {
      setStatus('error');
      setMessage('You must be logged in to finalize your credit purchase.');
    }
  }, [searchParams, user, toast, navigate]);

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
        
        <h1 className="text-2xl font-bold text-white mb-4 flex items-center justify-center gap-2">
          <CreditCard className="w-6 h-6" />
          {status === 'loading' && 'Finalizing Purchase'}
          {status === 'success' && 'Purchase Complete!'}
          {status === 'error' && 'Purchase Failed'}
        </h1>
        
        <p className="text-gray-300 mb-6">
          {message}
        </p>

        {status === 'success' && purchaseDetails.creditsAdded && (
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Credits Added:</span>
              <span className="text-white font-medium">{purchaseDetails.creditsAdded.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Amount Paid:</span>
              <span className="text-white font-medium">${purchaseDetails.amountPaid?.toFixed(2)}</span>
            </div>
          </div>
        )}

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
              onClick={() => navigate('/settings?tab=billing')}
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

export default CreditPurchaseVerification;