import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Crown, CreditCard, Check, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { MobileHeader } from '@/components/layout/MobileHeader';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Types
interface Plan {
  id: string;
  name: string;
  description?: string | null;
  price_monthly: number;
  price_yearly?: number | null;
  features: any;
  is_active: boolean;
  monthly_credits_allowance: number;
  paypal_subscription_id: string | null;
}

interface CreditPack {
  id: string;
  name: string;
  credits_granted: number;
  price: number;
  paypal_plan_id?: string | null;
  is_active: boolean;
  description?: string;
  created_at?: string;
}

// Hooks
const useSubscriptionData = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['subscription-data', user?.id],
    queryFn: async () => {
      const [plansRes, packsRes, creditsRes] = await Promise.allSettled([
        supabase.from('plans').select('*').eq('is_active', true).order('price_monthly'),
        supabase.from('credit_packs').select('*').eq('is_active', true).order('price'),
        user ? supabase.from('credits').select('balance').eq('user_id', user.id).single() : Promise.resolve({ data: null })
      ]);

      return {
        plans: plansRes.status === 'fulfilled' ? plansRes.value.data || [] : [],
        creditPacks: packsRes.status === 'fulfilled' ? packsRes.value.data || [] : [],
        credits: creditsRes.status === 'fulfilled' ? creditsRes.value.data : null
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: true
  });
};

// Helper function for PayPal
const openPayPalWindow = (url: string): Window | null => {
  const features = [
    'width=500',
    'height=600',
    'left=' + (window.screen.width / 2 - 250),
    'top=' + (window.screen.height / 2 - 300),
    'toolbar=no',
    'location=no',
    'directories=no',
    'status=no',
    'menubar=no',
    'scrollbars=yes',
    'resizable=yes',
    'copyhistory=no'
  ].join(',');

  return window.open(url, 'paypal_payment', features);
};

// Components
const FeatureComparisonTable: React.FC<{ plans: Plan[] }> = ({ plans }) => {
  const features = [
    { 
      name: 'Monthly Credits', 
      getValue: (plan: Plan) => `${plan.monthly_credits_allowance?.toLocaleString()} credits`
    },
    {
      name: 'Character Creation',
      getValue: (plan: Plan) => plan.features?.character_creation ? '✓' : '✗'
    },
    {
      name: 'NSFW Content',
      getValue: (plan: Plan) => plan.features?.nsfw_access ? '✓' : '✗'
    },
    {
      name: 'Image Generation',
      getValue: (plan: Plan) => plan.features?.image_generation ? '✓' : '✗'
    },
    {
      name: 'Voice Messages',
      getValue: (plan: Plan) => plan.features?.voice_messages ? '✓' : '✗'
    },
    {
      name: 'Priority Support',
      getValue: (plan: Plan) => plan.features?.priority_support ? '✓' : '✗'
    }
  ];

  const displayPlans = plans.filter(plan => 
    plan.name !== 'Free' && 
    plan.name !== 'Whale' &&
    plan.name !== 'True Fan'
  );

  return (
    <div className="overflow-x-auto mb-8">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left p-3 border-b border-white/10">Features</th>
            {displayPlans.map(plan => (
              <th key={plan.id} className="text-center p-3 border-b border-white/10">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((feature, index) => (
            <tr key={index} className="border-b border-white/5">
              <td className="p-3 font-medium">{feature.name}</td>
              {displayPlans.map(plan => (
                <td key={plan.id} className="text-center p-3">
                  {feature.getValue(plan)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const FAQSection: React.FC = () => {
  const faqs = [
    {
      question: "How do credits work?",
      answer: "Credits are consumed when you send messages to AI characters. Different AI models consume different amounts of credits. You can see your current balance and usage in your dashboard."
    },
    {
      question: "Can I change my plan anytime?",
      answer: "Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle."
    },
    {
      question: "What happens if I run out of credits?",
      answer: "If you run out of credits, you can purchase additional credit packs or upgrade to a higher tier plan. Free users can wait for their monthly credit refresh."
    },
    {
      question: "Is there a free trial?",
      answer: "New users automatically start with our Free plan which includes 1,000 credits per month. You can upgrade anytime to access more features and credits."
    },
    {
      question: "How does billing work?",
      answer: "Plans are billed monthly. Credit packs are one-time purchases. All payments are processed securely through PayPal."
    }
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-center mb-6">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
            <AccordionContent className="text-gray-300">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

const PlanFeature = ({ feature, included }: { feature: string; included: boolean }) => (
  <div className="flex items-center gap-2">
    {included ? (
      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
    ) : (
      <X className="w-4 h-4 text-gray-500 flex-shrink-0" />
    )}
    <span className={`text-sm ${included ? 'text-gray-200' : 'text-gray-500'}`}>
      {feature}
    </span>
  </div>
);

const PlanCard: React.FC<{
  plan: Plan;
  isPopular?: boolean;
  onSubscribe: (plan: Plan) => void;
  loading?: boolean;
}> = ({ plan, isPopular = false, onSubscribe, loading = false }) => {
  const getCrownIcon = () => {
    if (plan.name === 'True Fan') {
      return <Crown className="w-5 h-5 text-gray-400 fill-gray-400" />;
    } else if (plan.name === 'The Whale') {
      return <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500" />;
    }
    return null;
  };

  const getFeatureList = () => {
    const features = [];
    
    if (plan.monthly_credits_allowance) {
      features.push(`${plan.monthly_credits_allowance.toLocaleString()} credits/month`);
    }
    
    if (plan.features?.character_creation) features.push('Character Creation');
    if (plan.features?.nsfw_access) features.push('NSFW Content');
    if (plan.features?.image_generation) features.push('Image Generation');
    if (plan.features?.voice_messages) features.push('Voice Messages');
    if (plan.features?.priority_support) features.push('Priority Support');
    
    return features;
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`relative ${isPopular ? 'order-first md:order-none' : ''}`}
    >
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-[#FF7A00] text-white">
          Most Popular
        </Badge>
      )}
      
      <Card className={`bg-gray-800/50 border-gray-700 h-full flex flex-col ${
        isPopular ? 'border-[#FF7A00] shadow-lg shadow-[#FF7A00]/20' : ''
      }`}>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CardTitle className="text-xl">{plan.name}</CardTitle>
            {getCrownIcon()}
          </div>
          
          <div className="text-3xl font-bold">
            ${plan.price_monthly}
            <span className="text-lg font-normal text-gray-400">/month</span>
          </div>
          
          {plan.description && (
            <p className="text-sm text-gray-400 mt-2">{plan.description}</p>
          )}
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col">
          <div className="space-y-3 flex-1">
            {getFeatureList().map((feature, index) => (
              <PlanFeature key={index} feature={feature} included={true} />
            ))}
          </div>
          
          <Button
            onClick={() => onSubscribe(plan)}
            disabled={loading}
            className={`w-full mt-6 ${
              isPopular 
                ? 'bg-[#FF7A00] hover:bg-[#FF7A00]/80' 
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
          >
            {loading ? 'Processing...' : 'Subscribe'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};
  if (!stats || !currentPlan) return null;

  const usagePercentage = currentPlan.monthly_credits_allowance > 0 
    ? (stats.creditsUsed / currentPlan.monthly_credits_allowance) * 100 
    : 0;

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#FF7A00]" />
          Your Usage This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Credits Used</span>
            <span>{stats.creditsUsed.toLocaleString()} / {currentPlan.monthly_credits_allowance.toLocaleString()}</span>
          </div>
          <Progress value={usagePercentage} className="h-2" />
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="text-2xl font-bold text-white">{stats.totalChats}</p>
            <p className="text-sm text-gray-400">Total Chats</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{credits?.balance?.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-400">Credits Balance</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const CreditPackCard = ({ pack, onPurchase, loading }: { pack: CreditPack; onPurchase: () => void; loading?: boolean }) => (
          
          <Button
            onClick={onSelect}
            disabled={disabled || isCurrentPlan}
            className={`w-full ${
              isCurrentPlan 
                ? 'bg-gray-600 text-gray-400' 
                : canUpgrade 
                  ? 'bg-[#FF7A00] hover:bg-[#FF7A00]/90' 
                  : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {isCurrentPlan ? 'Current Plan' : canUpgrade ? 'Upgrade' : 'Subscribe'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const CreditPackCard = ({ pack, onPurchase, disabled }: { pack: CreditPack; onPurchase: () => void; disabled: boolean }) => {
  const bonusPercentage = pack.credits_granted > 10000 ? Math.round(((pack.credits_granted - 10000) / 10000) * 100) : 0;
  
  return (
    <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
      <Card className="bg-gray-800/50 border-gray-700 hover:border-[#FF7A00]/50 transition-all h-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl text-white">{pack.name}</CardTitle>
              <p className="text-3xl font-bold text-[#FF7A00] mt-2">
                {pack.credits_granted.toLocaleString()}
              </p>
              <p className="text-sm text-gray-400">credits</p>
            </div>
            {bonusPercentage > 0 && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                +{bonusPercentage}% bonus
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl font-bold text-white">${pack.price}</span>
            <span className="text-sm text-gray-400">${(pack.price / pack.credits_granted * 1000).toFixed(2)}/1k</span>
          </div>
          <Button 
            onClick={onPurchase} 
            disabled={disabled}
            className="w-full bg-primary hover:bg-primary/90"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Buy Now
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};
// Main Component
export default function Subscription() {
  const { user, subscription: userSubscription } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useSubscriptionData();
  
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const currentPlan = userSubscription?.plan || null;
  const isGuestUser = !user || currentPlan?.name === 'Guest Pass';

  // Add retry mechanism
  const retryWithDelay = async (fn: () => Promise<any>, retries = 3, delay = 1000) => {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0) {
        console.log(`⏳ Retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryWithDelay(fn, retries - 1, delay * 1.5);
      }
      throw error;
    }
  };

  const handlePlanAction = async (plan: Plan) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    // Show upgrade confirmation for paid users
    if (currentPlan && currentPlan.price_monthly > 0 && plan.price_monthly > currentPlan.price_monthly) {
      setSelectedPlan(plan);
      setShowUpgradeDialog(true);
      return;
    }

    await processPlanAction(plan);
  };

  const processPlanAction = async (plan: Plan) => {
    console.log('🔄 Processing plan action:', { 
      planId: plan.id, 
      planName: plan.name,
      hasUpgradeFrom: !!userSubscription?.paypal_subscription_id 
    });
    
    try {
      setProcessingAction(plan.id);
      setShowUpgradeDialog(false);

      const requestBody = {
        operation: 'create-subscription',
        planId: plan.id,
        upgradeFromSubscriptionId: userSubscription?.paypal_subscription_id
      };
      
      console.log('📤 Sending request to paypal-management:', requestBody);

      // Add retry logic for network issues
      const response = await retryWithDelay(async () => {
        return await supabase.functions.invoke('paypal-management', {
          body: requestBody
        });
      });

      const { data, error } = response;

      console.log('📥 Response received:', { data, error });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }

      // Fix: Check for correct response structure with detailed logging
      if (data?.success && data?.data?.approvalUrl) {
        console.log('✅ Opening PayPal window with URL:', data.data.approvalUrl);
        openPayPalWindow(data.data.approvalUrl);
      } else {
        console.error('❌ Invalid response structure:', {
          hasSuccess: !!data?.success,
          hasData: !!data?.data,
          hasApprovalUrl: !!data?.data?.approvalUrl,
          fullResponse: data
        });
        
        // Provide more specific error message based on response
        if (!data) {
          throw new Error('No response received from payment service');
        } else if (!data.success) {
          throw new Error(data.error || 'Payment service returned an error');
        } else {
          throw new Error('Invalid response format from payment service');
        }
      }
    } catch (error) {
      console.error('❌ Plan action error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = "Failed to process subscription. Please try again.";
      
      if (error instanceof Error) {
        if (error.message.includes('network')) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else if (error.message.includes('timeout')) {
          errorMessage = "Request timed out. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Subscription Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCreditPurchase = async (pack: CreditPack) => {
    console.log('🔄 Processing credit purchase:', { 
      packId: pack.id, 
      packName: pack.name,
      credits: pack.credits_granted 
    });
    
    try {
      setProcessingAction(pack.id);

      const requestBody = {
        operation: 'create-order',
        creditPackId: pack.id
      };
      
      console.log('📤 Sending credit purchase request to paypal-management:', requestBody);

      // Add retry logic for network issues
      const response = await retryWithDelay(async () => {
        return await supabase.functions.invoke('paypal-management', {
          body: requestBody
        });
      });

      const { data, error } = response;

      console.log('📥 Credit purchase response received:', { data, error });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }

      // Fix: Check for correct response structure with multiple fallbacks
      if (data?.success && data?.data?.approvalUrl) {
        console.log('✅ Opening PayPal window for credit purchase:', data.data.approvalUrl);
        openPayPalWindow(data.data.approvalUrl);
      } else if (data?.data?.approvalUrl) {  // Fallback for direct data structure
        console.log('✅ Opening PayPal window (fallback):', data.data.approvalUrl);
        openPayPalWindow(data.data.approvalUrl);
      } else {
        console.error('❌ Invalid credit purchase response structure:', {
          hasSuccess: !!data?.success,
          hasData: !!data?.data,
          hasApprovalUrl: !!data?.data?.approvalUrl,
          fullResponse: data
        });
        
        // Provide more specific error message based on response
        if (!data) {
          throw new Error('No response received from payment service');
        } else if (!data.success) {
          throw new Error(data.error || 'Payment service returned an error');
        } else {
          throw new Error('Invalid response format from payment service');
        }
      }
    } catch (error) {
      console.error('❌ Credit purchase error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = "Failed to process credit purchase. Please try again.";
      
      if (error instanceof Error) {
        if (error.message.includes('network')) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else if (error.message.includes('timeout')) {
          errorMessage = "Request timed out. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Credit Purchase Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const openPayPalWindow = (url: string) => {
    console.log('🪟 Opening PayPal window:', url);
    
    const width = 500;  // Smaller width for compact PayPal UI
    const height = 700; // Optimal height for PayPal flow
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    setShowPaymentModal(true);
    
    // Important: Remove spaces in the features string and ensure all features are set
    const windowFeatures = `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`;
    
    const popup = window.open(
      url,
      'paypal-window',
      windowFeatures
    );

    if (!popup) {
      console.error('❌ Failed to open PayPal window - popup blocked?');
      toast({
        title: "Popup Blocked",
        description: "Please allow popups for this site to complete payment.",
        variant: "destructive"
      });
      setShowPaymentModal(false);
      return;
    }

    // Focus the popup window to bring it to the front
    popup.focus();

    const handleMessage = (event: MessageEvent) => {
      console.log('📨 Received message:', event.data);
      
      if (event.data?.paypal_status === 'success') {
        console.log('✅ Payment successful!');
        window.removeEventListener('message', handleMessage);
        setShowPaymentModal(false);
        toast({
          title: "Success!",
          description: "Your payment was processed successfully.",
        });
        
        // Use a slight delay before reload to ensure toast is visible
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    };

    window.addEventListener('message', handleMessage);

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        console.log('🪟 PayPal window closed');
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        setShowPaymentModal(false);
      }
    }, 1000);
  };

  if (isLoading) {
    return (
      <>
        <MobileHeader title="Subscription" />
        <div className="min-h-screen bg-gray-900 pt-24 pb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-8">
              <Skeleton className="h-12 w-64 mx-auto" />
              <div className="grid md:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-96" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const { plans = [], creditPacks = [], credits = null } = data || {};

  // Filter plans to exclude specific ones and get display plans
  const displayPlans = plans.filter(plan => 
    plan.name !== 'Free' && 
    plan.name !== 'Whale' &&
    plan.name !== 'True Fan'
  );

  return (
    <>
      <MobileHeader title="Subscription" />
      <div className="min-h-screen bg-gray-900 pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Choose Your Plan
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Unlock the full potential of AI conversations with our flexible subscription plans
            </p>
          </div>

          {/* Feature Comparison Table */}
          <FeatureComparisonTable plans={displayPlans} />

          {/* Plans Grid - Only Monthly, No Tabs */}
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-16">
            {displayPlans.map((plan, idx) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isPopular={plan.name === 'Pro'} // Make Pro the popular one
                onSubscribe={handlePlanAction}
                loading={!!processingAction}
              />
            ))}
          </div>

          {/* Credit Packs - Only for paid users */}
          {currentPlan && currentPlan.price_monthly > 0 && creditPacks.length > 0 && (
            <div className="mb-16">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-3">
                  Need More Credits?
                </h2>
                <p className="text-gray-400">
                  Boost your conversations with one-time credit purchases
                </p>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6">
                {creditPacks.map(pack => (
                  <Card key={pack.id} className="bg-gray-800/50 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-xl text-white">{pack.name}</CardTitle>
                      <div className="text-2xl font-bold text-white">
                        ${pack.price}
                        <span className="text-sm font-normal text-gray-400 ml-2">
                          {pack.credits_granted.toLocaleString()} credits
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={() => handleCreditPurchase(pack)}
                        disabled={!!processingAction}
                        className="w-full bg-gray-600 hover:bg-gray-500"
                      >
                        {processingAction ? 'Processing...' : 'Purchase'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* FAQ Section with Accordion */}
          <FAQSection />
        </div>
      </div>

      {/* Upgrade Confirmation Dialog */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirm Plan Upgrade</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              You are upgrading from <strong>{currentPlan?.name}</strong> to <strong>{selectedPlan?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {selectedPlan && currentPlan && (
            <div className="space-y-3 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span>New monthly price:</span>
                  <span className="font-semibold">${selectedPlan.price_monthly}/month</span>
                </div>
                <div className="flex justify-between">
                  <span>Additional credits:</span>
                  <span className="font-semibold">
                    +{(selectedPlan.monthly_credits_allowance - currentPlan.monthly_credits_allowance).toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                Your new plan will take effect immediately and you'll be charged the prorated difference.
              </p>
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-white hover:bg-gray-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => selectedPlan && processPlanAction(selectedPlan)}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
            >
              {processingAction ? 'Processing...' : 'Confirm Upgrade'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="bg-[#1a1a2e] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Complete Your Payment</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <p className="text-gray-300 text-center mb-4">
              Please complete your payment in the PayPal window.
            </p>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF7A00]"></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}