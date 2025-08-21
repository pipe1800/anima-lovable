import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { Payments, Billing } from '@/data';
import { useToast } from '@/hooks/use-toast';
import { Crown, CreditCard, Check, X, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Database } from '@/integrations/supabase/types';

// Types
// Removed direct billing row types; using RPC result shapes
interface Plan {
  id: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  monthly_credits_allowance: number;
  features: any;
  paypal_subscription_id: string | null;
  price_monthly_display: number; // derived dollars
  description?: string | null; // may exist in future
}
interface CreditPack {
  id: string;
  name: string;
  price_cents: number;
  credits_granted: number;
  description: string | null;
  price_display: number; // derived dollars
}

// Hooks
const useSubscriptionData = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['subscription-data', user?.id],
    queryFn: async () => {
      if (!user) return { plans: [], creditPacks: [], credits: null };
      const { data, error } = await Billing.getUserSubscriptionForUser(user.id);
      if (error) throw error;
      return { plans: [], creditPacks: [], credits: data };
    },
    staleTime: 1000 * 60 * 5,
    enabled: true
  });
};

// Components
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

const PlanCard = ({ 
  plan, 
  currentPlan, 
  isPopular, 
  onSelect,
  disabled 
}: { 
  plan: Plan; 
  currentPlan: Plan | null;
  isPopular?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) => {
  const currentMonthly = currentPlan?.price_monthly ?? 0;
  const isCurrentPlan = currentPlan?.id === plan.id;
  const canUpgrade = currentPlan && !isCurrentPlan && (plan.price_monthly ?? 0) > currentMonthly;
  
  // Extract features from plan
  const getFeatures = () => {
    if (!plan.features) return [];
    
    // Handle different feature formats
    if (Array.isArray(plan.features)) {
      return plan.features;
    } else if (typeof plan.features === 'object' && plan.features.features) {
      return plan.features.features;
    } else if (typeof plan.features === 'object') {
      // Convert feature flags to readable strings
      const featureList = [];
      if (plan.features.character_creation) featureList.push('Character Creation');
      if (plan.features.nsfw_access) featureList.push('NSFW Content Access');
      if (plan.features.image_generation) featureList.push('Image Generation');
      if (plan.features.voice_messages) featureList.push('Voice Messages');
      if (plan.features.priority_support) featureList.push('Priority Support');
      return featureList;
    }
    return [];
  };
  
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="relative h-full"
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge className="bg-[#FF7A00] text-white px-2 sm:px-3 py-1 text-sm sm:text-base">
            Most Popular
          </Badge>
        </div>
      )}
      
      <Card className={`h-full flex flex-col ${isPopular ? 'border-[#FF7A00] shadow-lg shadow-[#FF7A00]/20' : 'border-gray-700'} 
        ${isCurrentPlan ? 'bg-[#1a1a2e]/80' : 'bg-[#1a1a2e]'} hover:border-gray-600 transition-all`}>
        <CardHeader className="pb-3 sm:pb-4">
          <div className="flex items-start justify-between">
            <div className="w-full">
              <CardTitle className="text-xl sm:text-2xl text-white flex items-center gap-2">
                {plan.name}
                {plan.name === 'True Fan' && <Crown className="w-4 h-4 sm:w-5 sm:h-5 fill-gray-300 text-gray-300" />}
                {plan.name === 'The Whale' && <Crown className="w-4 h-4 sm:w-5 sm:h-5 fill-yellow-500 text-yellow-500" />}
              </CardTitle>
              {plan.description && (
                <CardDescription className="mt-1 sm:mt-2 text-sm sm:text-base">{plan.description}</CardDescription>
              )}
            </div>
            {isCurrentPlan && (
              <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/50 text-xs whitespace-nowrap ml-2">
                Current
              </Badge>
            )}
          </div>
          
          <div className="mt-3 sm:mt-4">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-bold text-white">
                ${plan.price_monthly_display.toFixed(2)}
              </span>
              <span className="text-gray-400 text-sm">/month</span>
            </div>
            <p className="text-sm sm:text-base text-gray-400 mt-1">
              {plan.monthly_credits_allowance.toLocaleString()} credits/month
            </p>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col px-4 sm:px-6">
          <div className="space-y-2 sm:space-y-3 flex-1">
            {getFeatures().slice(0, 5).map((feature: string, idx: number) => (
              <PlanFeature key={idx} feature={feature} included={true} />
            ))}
          </div>
          
          <Button
            onClick={onSelect}
            disabled={disabled || isCurrentPlan}
            className={`w-full mt-4 sm:mt-6 py-2 sm:py-3 text-sm sm:text-base ${
              isCurrentPlan 
                ? 'bg-gray-700 text-gray-400' 
                : canUpgrade 
                  ? 'bg-[#FF7A00] hover:bg-[#FF7A00]/90' 
                  : 'bg-[#FF7A00] hover:bg-[#FF7A00]/90'
            }`}
          >
            {isCurrentPlan ? 'Current Plan' : canUpgrade ? 'Upgrade' : 'Subscribe'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const FeatureComparisonTable = ({ plans }: { plans: Plan[] }) => {
  if (!plans || plans.length === 0) return null;

  const features = [
    { label: 'Monthly Price', key: 'price' },
    { label: 'Monthly Credits', key: 'credits' },
    { label: 'Cost per Message', key: 'message_cost' },
    { label: 'Messages per Day', key: 'messages' },
    { label: 'Character Creation', key: 'characters' },
    { label: 'Premium AI Models', key: 'premium_models' },
    { label: 'No Queue/Priority', key: 'priority' },
    { label: 'Enhanced Memory', key: 'memory' },
    { label: 'NSFW Content', key: 'nsfw' },
    { label: 'Add-ons Available', key: 'addons' },
    { label: 'Credit Booster Packs', key: 'boosters' },
  ];

  const getFeatureValue = (plan: Plan, featureKey: string) => {
    switch (featureKey) {
      case 'price':
        return (plan.price_monthly ?? 0) === 0 ? 'Free' : `$${plan.price_monthly_display.toFixed(2)}/mo`;
      case 'credits':
        return plan.monthly_credits_allowance.toLocaleString();
      case 'message_cost':
        return '10 credits';

      case 'premium_models':
        return plan.name !== 'Guest Pass';
      case 'priority':
        return plan.name !== 'Guest Pass';
      case 'memory':
        return plan.name === 'Guest Pass' ? '12K Context' : plan.name === 'True Fan' ? '16K Context' : '24K Context';
      case 'nsfw':
        return plan.name !== 'Guest Pass';
      case 'addons':
        return plan.name !== 'Guest Pass';
      case 'boosters':
        return plan.name !== 'Guest Pass';
      default:
        return false;
    }
  };

  return (
    <div className="mt-16 mb-16">
      <h2 className="text-3xl font-bold text-white text-center mb-8">
        Compare Plans
      </h2>
      <Card className="bg-[#1a1a2e] border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-4 px-6 text-gray-300 font-medium min-w-[200px]">
                  Features
                </th>
                {plans.map((plan) => (
                  <th key={plan.id} className="text-center py-4 px-6 min-w-[140px]">
                    <div className="text-lg font-bold text-white">{plan.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, idx) => (
                <tr key={feature.key} className={`border-b border-gray-700/30 ${
                  idx % 2 === 0 ? 'bg-[#1a1a2e]/20' : 'bg-transparent'
                }`}>
                  <td className="py-4 px-6 text-gray-300 font-medium">
                    {feature.label}
                  </td>
                  {plans.map((plan) => {
                    const value = getFeatureValue(plan, feature.key);
                    return (
                      <td key={plan.id} className="py-4 px-6 text-center">
                        {typeof value === 'boolean' ? (
                          value ? (
                            <Check className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-gray-500 mx-auto" />
                          )
                        ) : (
                          <span className="text-white">{value}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const CreditPackCard = ({ pack, onPurchase, disabled }: { pack: CreditPack; onPurchase: () => void; disabled: boolean }) => {
  const bonusPercentage = pack.credits_granted > 10000 ? Math.round(((pack.credits_granted - 10000) / 10000) * 100) : 0;
  return (
    <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
      <Card className="bg-[#1a1a2e] border-gray-700 hover:border-[#FF7A00]/50 transition-all h-full">
        <CardHeader className="pb-3 sm:pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg sm:text-xl text-white">{pack.name}</CardTitle>
              <p className="text-2xl sm:text-3xl font-bold text-[#FF7A00] mt-1 sm:mt-2">
                {pack.credits_granted.toLocaleString()}
              </p>
              <p className="text-sm sm:text-base text-gray-400">credits</p>
            </div>
            {bonusPercentage > 0 && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/50 text-xs">
                +{bonusPercentage}%
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-xl sm:text-2xl font-bold text-white">${pack.price_display.toFixed(2)}</span>
            <span className="text-sm sm:text-base text-gray-400">${(pack.price_display / pack.credits_granted * 1000).toFixed(2)}/1k</span>
          </div>
          <Button 
            onClick={onPurchase} 
            disabled={disabled}
            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 py-2 text-sm sm:text-base"
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
  // Enrich current plan with display field for consistency
  const currentPlan: Plan | null = userSubscription?.plan ? {
    ...(userSubscription.plan as any),
    price_monthly_display: ((userSubscription.plan as any).price_monthly ?? 0) / 100
  } : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useSubscriptionData();
  
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [activeMobilePlan, setActiveMobilePlan] = useState<number>(0);

  // Filter plans based on current subscription
  const getVisiblePlans = (allPlans: Plan[]) => {
    if (!currentPlan || currentPlan.name === 'Guest Pass') return allPlans;
    if (currentPlan.name === 'True Fan') return allPlans.filter(p => ['True Fan','The Whale'].includes(p.name));
    if (currentPlan.name === 'The Whale') return allPlans.filter(p => p.name === 'The Whale');
    return allPlans;
  };

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
      } as const;
      
      console.log('📤 Sending request to paypal-management:', requestBody);

      // Add retry logic for network issues
      const response = await retryWithDelay(async () => Payments.createSubscription(requestBody.planId, requestBody.upgradeFromSubscriptionId));

      const { data, error } = response;

      console.log('📥 Response received:', { data, error });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }

      // Fix: Check for correct response structure with detailed logging
      if (data?.success && data?.data?.approvalUrl) {
        console.log('✅ Opening PayPal window with URL:', data.data.approvalUrl);
        // Persist state nonce (if provided) for later verification step to mitigate CSRF/replay
        if (data?.data?.state) {
          try { localStorage.setItem('paypal_upgrade_state', data.data.state); } catch {}
        }
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
        const msg = error.message.toLowerCase();
        if (msg.includes('network')) errorMessage = 'Network issue. Please retry.';
        else if (msg.includes('timeout')) errorMessage = 'Request timed out. Try again.';
        // Otherwise keep generic sanitized message
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
      const response = await retryWithDelay(async () => Payments.createCreditOrder(requestBody.creditPackId));

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
        const msg = error.message.toLowerCase();
        if (msg.includes('network')) errorMessage = 'Network issue. Please retry.';
        else if (msg.includes('timeout')) errorMessage = 'Request timed out. Try again.';
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
    
    const width = 500;
    const height = 700;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    setShowPaymentModal(true);
    
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
      <div className="min-h-screen bg-[#121212] pt-24 pb-12">
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
    );
  }

  const { plans = [], creditPacks = [], credits = null } = data || {};
  const visiblePlans = getVisiblePlans(plans);

  const faqs = [
    {
      question: "Can I cancel anytime?",
      answer: "Yes! You can cancel your subscription at any time from your account settings. You'll continue to have access until the end of your billing period."
    },
    {
      question: "What happens to unused credits?",
      answer: "Monthly credits roll over for a maximum of 2x your monthly allowance. For example, if you have the True Fan plan, you can accumulate a total of 30,000 credits."
    },
    {
      question: "Can I upgrade my plan?",
      answer: "Absolutely! You can upgrade your plan at any time. When you upgrade, you'll be charged the prorated difference for the remainder of your billing cycle, and your new benefits will take effect immediately."
    },
    {
      question: "What payment methods do you accept?",
      answer: "Currently we only accept Paypal, but we plan to add more payment methods in the future. All payments are processed securely through PayPal's payment gateway, even if you choose to pay with a credit card."
    }
  ];

  return (
    <>
      <div className="min-h-screen bg-[#121212] pt-16 md:pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header - Mobile optimized */}
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 md:mb-4">
              Choose Your Plan
            </h1>
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto px-2">
              Unlock the full potential of AI conversations with our flexible subscription plans
            </p>
          </div>

          {/* Plans - Desktop grid and Mobile tabs */}
          <div className="mb-12 md:mb-16">
            {/* Desktop grid - unchanged */}
            <div className={`hidden md:grid gap-6 lg:gap-8 ${
              visiblePlans.length === 1 
                ? 'grid-cols-1 max-w-md mx-auto' 
                : visiblePlans.length === 2 
                  ? 'grid-cols-2 max-w-4xl mx-auto' 
                  : 'grid-cols-3'
            }`}>
              {visiblePlans.map((plan, idx) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentPlan={currentPlan}
                  isPopular={plan.name === 'True Fan' && visiblePlans.length > 2}
                  onSelect={() => handlePlanAction(plan)}
                  disabled={!!processingAction}
                />
              ))}
            </div>

            {/* Mobile tabs */}
            <div className="block md:hidden">
              {/* Tab buttons */}
              <div className="flex justify-center mb-6">
                <div className="flex bg-[#1a1a2e]/50 rounded-lg p-1 border border-gray-700">
                  {visiblePlans.map((plan, idx) => (
                    <button
                      key={plan.id}
                      onClick={() => setActiveMobilePlan(idx)}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        activeMobilePlan === idx
                          ? 'bg-[#FF7A00] text-white shadow-sm'
                          : 'text-gray-400 hover:text-white hover:bg-[#1a1a2e]/80'
                      }`}
                    >
                      {plan.name}
                      {plan.name === 'True Fan' && visiblePlans.length > 2 && (
                        <span className="ml-1 text-xs">⭐</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active plan card */}
              <div className="max-w-sm mx-auto">
                {visiblePlans[activeMobilePlan] && (
                  <PlanCard
                    key={visiblePlans[activeMobilePlan].id}
                    plan={visiblePlans[activeMobilePlan]}
                    currentPlan={currentPlan}
                    isPopular={visiblePlans[activeMobilePlan].name === 'True Fan' && visiblePlans.length > 2}
                    onSelect={() => handlePlanAction(visiblePlans[activeMobilePlan])}
                    disabled={!!processingAction}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Feature Comparison Table - Hidden on mobile, show simplified version */}
          <div className="hidden md:block">
            <FeatureComparisonTable plans={plans} />
          </div>
          
          {/* Mobile Feature Comparison - Simplified accordion */}
          <div className="block md:hidden mb-12">
            <h2 className="text-2xl font-bold text-white text-center mb-6">
              Compare Features
            </h2>
            <Accordion type="single" collapsible className="w-full space-y-3">
              {plans.map((plan) => (
                <AccordionItem key={plan.id} value={plan.id} className="bg-[#1a1a2e]/50 border border-gray-700 rounded-lg px-4">
                  <AccordionTrigger className="text-left hover:no-underline py-4">
                    <span className="text-lg text-white font-semibold">{plan.name}</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-400 pb-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Monthly Price:</span>
                        <span className="text-white font-semibold">${plan.price_monthly_display.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Monthly Credits:</span>
                        <span className="text-white font-semibold">{plan.monthly_credits_allowance.toLocaleString()}</span>
                      </div>
                      <div className="pt-2 border-t border-gray-700/50">
                        <p className="text-sm">All plans include character creation, chat features, and community access.</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Credit Packs - Mobile optimized */}
          {currentPlan && currentPlan.price_monthly > 0 && creditPacks.length > 0 && (
            <div className="mb-12 md:mb-16">
              <div className="text-center mb-6 md:mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 md:mb-3">
                  Need More Credits?
                </h2>
                <p className="text-gray-400 text-sm sm:text-base">
                  Boost your conversations with one-time credit purchases
                </p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {creditPacks.map(pack => (
                  <CreditPackCard
                    key={pack.id}
                    pack={pack}
                    onPurchase={() => handleCreditPurchase(pack)}
                    disabled={!!processingAction}
                  />
                ))}
              </div>
            </div>
          )}

          {/* FAQ Section - Mobile optimized */}
          <div className="mt-12 md:mt-16">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-6 md:mb-8">
              Frequently Asked Questions
            </h2>
            <Accordion type="single" collapsible className="w-full space-y-3 md:space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="bg-[#1a1a2e]/50 border border-gray-700 rounded-lg px-4 sm:px-6">
                  <AccordionTrigger className="text-left hover:no-underline py-4 sm:py-6">
                    <span className="text-base sm:text-lg text-white pr-2">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-400 pb-4 sm:pb-6 text-sm sm:text-base">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
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
              <div className="bg-[#1a1a2e]/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span>New monthly price:</span>
                  <span className="font-semibold">${selectedPlan.price_monthly_display.toFixed(2)}/month</span>
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
            <AlertDialogCancel className="border-gray-600 text-white hover:bg-[#1a1a2e]">
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

      {/* NOTE: All billing data now sourced from billing.* schema (read-only via RLS). */}
    </>
  );
}