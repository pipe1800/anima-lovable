import React, { useState, useEffect } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { 
  getActivePlans, 
  getActiveModels, 
  getActiveCreditPacks,
  getUserActiveSubscription 
} from '@/lib/supabase-queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Crown, Zap, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FeatureComparisonTable } from '@/components/subscription/FeatureComparisonTable';

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  monthly_credits_allowance: number;
  features: any;
  is_active: boolean;
}

interface Model {
  id: string;
  tier_name: string;
  credit_multiplier: number;
  is_nsfw_compatible: boolean;
  description: string;
  min_plan: {
    name: string;
    price_monthly: number;
  } | null;
}

interface CreditPack {
  id: string;
  name: string;
  price: number;
  credits_granted: number;
  description: string;
}

interface UserSubscription {
  id: string;
  status: string;
  plan: Plan;
  paypal_subscription_id: string | null;
}

const Subscription = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isPurchasingCredits, setIsPurchasingCredits] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUpgradeConfirmation, setShowUpgradeConfirmation] = useState(false);
  const [planToUpgradeTo, setPlanToUpgradeTo] = useState<Plan | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, modelsRes, creditPacksRes] = await Promise.all([
          getActivePlans(),
          getActiveModels(),
          getActiveCreditPacks()
        ]);

        if (plansRes.error) throw plansRes.error;
        if (modelsRes.error) throw modelsRes.error;
        if (creditPacksRes.error) throw creditPacksRes.error;


        setPlans(plansRes.data || []);
        setModels(modelsRes.data || []);
        setCreditPacks(creditPacksRes.data || []);

        // Fetch user subscription if authenticated
        if (user) {
          const subRes = await getUserActiveSubscription(user.id);
          if (subRes.error) {
            console.error('Error fetching subscription:', subRes.error);
          } else {
            setUserSubscription(subRes.data);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to load subscription data",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, toast]);

  const handleSubscriptionAction = (targetPlan: Plan) => {
    // Check if this is an upgrade case that needs confirmation
    if (userSubscription && userSubscription.plan.name === 'True Fan' && targetPlan.name === 'The Whale') {
      // Show confirmation dialog for True Fan → The Whale upgrade
      setPlanToUpgradeTo(targetPlan);
      setShowUpgradeConfirmation(true);
    } else {
      // For other cases (new subscriptions from guest users), proceed directly
      processSubscriptionAction(targetPlan);
    }
  };

  const processSubscriptionAction = async (targetPlan: Plan) => {
    try {
      setIsUpgrading(true);
      setShowUpgradeConfirmation(false);

      let response;
      
      // Check if user has an active subscription and if it's the specific upgrade case
      if (userSubscription && userSubscription.plan.name === 'True Fan' && targetPlan.name === 'The Whale') {
        // True Fan upgrading to The Whale - use initiate-upgrade like in BillingSettings
        response = await supabase.functions.invoke('initiate-upgrade');
      } else if (!userSubscription || userSubscription.plan.name === 'Guest Pass') {
        // Guest user or Guest Pass user - create new subscription
        response = await supabase.functions.invoke('create-paypal-subscription', {
          body: { planId: targetPlan.id }
        });
      } else {
        // Invalid action
        toast({
          title: "Error",
          description: "Invalid subscription action",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = response;

      if (error) {
        console.error('Subscription action error:', error);
        toast({
          title: "Error",
          description: "Failed to process subscription action",
          variant: "destructive"
        });
        return;
      }

      // Open PayPal in a centered popup window
      if (data?.approvalUrl || (data?.success && data?.approvalUrl)) {
        const approvalUrl = data.approvalUrl;
        const width = 600;
        const height = 800;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);
        
        setShowPaymentModal(true);
        
        const popup = window.open(
          approvalUrl,
          'paypal-payment',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );
        
        // Set up message listener for popup communication
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.paypal_status === 'success') {
            // Payment successful, clean up and redirect
            window.removeEventListener('message', handleMessage);
            setShowPaymentModal(false);
            setIsUpgrading(false);
            // Always redirect back to subscription page
            window.location.href = '/subscription';
          }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Monitor popup closure as fallback
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            setShowPaymentModal(false);
            setIsUpgrading(false);
            // Refresh the page to update subscription status
            window.location.reload();
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Subscription action error:', error);
      toast({
        title: "Error",
        description: "Failed to process subscription action",
        variant: "destructive"
      });
      setIsUpgrading(false);
    }
  };

  const handleCreditPackPurchase = async (packId: string) => {
    try {
      setIsPurchasingCredits(true);

      const response = await supabase.functions.invoke('create-credit-purchase', {
        body: { packId }
      });

      const { data, error } = response;

      if (error) {
        console.error('Credit pack purchase error:', error);
        toast({
          title: "Error",
          description: "Failed to process credit pack purchase",
          variant: "destructive"
        });
        return;
      }

      // Open PayPal in a centered popup window
      if (data?.approvalUrl) {
        const approvalUrl = data.approvalUrl;
        const width = 600;
        const height = 800;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);
        
        setShowPaymentModal(true);
        
        const popup = window.open(
          approvalUrl,
          'paypal-credit-purchase',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );
        
        // Set up message listener for popup communication
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.paypal_status === 'success') {
            // Payment successful, clean up and redirect
            window.removeEventListener('message', handleMessage);
            setShowPaymentModal(false);
            setIsPurchasingCredits(false);
            toast({
              title: "Success!",
              description: "Credit pack purchased successfully! Credits will be added to your account shortly.",
              variant: "default"
            });
            // Refresh the page to update any credit displays
            window.location.reload();
          }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Monitor popup closure as fallback
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            setShowPaymentModal(false);
            setIsPurchasingCredits(false);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Credit pack purchase error:', error);
      toast({
        title: "Error",
        description: "Failed to process credit pack purchase",
        variant: "destructive"
      });
      setIsPurchasingCredits(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[#FF7A00]"></div>
      </div>
    );
  }

  return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Unlock Your AI's True Potential
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Choose a plan to get a massive pool of credits, access to superior AI models, and powerful features.
          </p>
        </div>

        {/* Subscription Tier Cards */}
        {(() => {
          // Fixed logic: Guest Pass users are those with Guest Pass plan
          const isGuestUser = userSubscription?.plan?.name === 'Guest Pass' || !userSubscription;
          const currentPlan = userSubscription?.plan?.name;
          let plansToShow = [];

          if (isGuestUser) {
            // Guest Pass users - show all paid plans
            plansToShow = plans.filter(plan => plan.price_monthly > 0);
          } else if (currentPlan === 'True Fan') {
            // True Fan - show current plan and The Whale upgrade option
            plansToShow = plans.filter(plan => plan.name === 'True Fan' || plan.name === 'The Whale');
          } else if (currentPlan === 'The Whale') {
            // The Whale - show only current plan
            plansToShow = plans.filter(plan => plan.name === 'The Whale');
          } else {
            // Fallback - show all plans
            plansToShow = plans;
          }

          // Dynamic container classes based on number of plans
          const getContainerClasses = () => {
            return "flex flex-wrap justify-center gap-8";
          };

          // Dynamic card classes based on number of plans
          const getCardClasses = () => {
            if (plansToShow.length === 1) return "w-full max-w-md";
            if (plansToShow.length === 2) return "w-full max-w-md";
            if (plansToShow.length === 3) return "w-full max-w-sm";
            return "w-full max-w-md";
          };

          return (
            <div className={getContainerClasses()}>
              {plans.length === 0 ? (
                <div className="col-span-3 text-center text-white">
                  <p>No subscription plans available at the moment.</p>
                </div>
              ) : (
                plansToShow.map((plan) => {
                  const isPopular = plan.name === 'True Fan';
                  const isPremium = plan.name === 'The Whale';
                  const isCurrentPlan = userSubscription?.plan?.name === plan.name;
                  const canUpgrade = currentPlan === 'True Fan' && plan.name === 'The Whale';
                  
                  return (
                     <Card 
                       key={plan.id} 
                       className={`${getCardClasses()} bg-[#1a1a2e] border-gray-700/50 relative overflow-hidden min-h-[600px] flex flex-col ${
                         isPopular ? 'ring-2 ring-[#FF7A00]' : ''
                       } ${isCurrentPlan ? 'ring-2 ring-green-500' : ''}`}
                   >
                    {isPopular && !isCurrentPlan && (
                      <div className="absolute top-4 right-4">
                        <div className="bg-[#FF7A00] text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          Popular
                        </div>
                      </div>
                    )}
                    
                    {isCurrentPlan && (
                      <div className="absolute top-4 right-4">
                        <div className="bg-green-600 text-white px-2 py-1 rounded text-xs font-medium">
                          Current Plan
                        </div>
                      </div>
                    )}
                    
                    <CardHeader className="pb-4">
                      <CardTitle className="text-2xl text-white flex items-center gap-2">
                        {isPremium ? <Crown className="w-6 h-6 text-[#FF7A00]" /> : <Zap className="w-6 h-6 text-[#FF7A00]" />}
                        {plan.name}
                      </CardTitle>
                      <div className="space-y-2">
                        <div className="text-3xl font-bold text-[#FF7A00]">
                          ${plan.price_monthly}
                          <span className="text-lg text-gray-400 font-normal">/month</span>
                        </div>
                        <div className="text-lg text-gray-300">
                          {plan.monthly_credits_allowance.toLocaleString()} Credits
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="flex-1 flex flex-col">
                      {/* Features List */}
                      <div className="flex-1">
                        {plan.features?.features && Array.isArray(plan.features.features) && (
                          <div className="space-y-2">
                            {plan.features.features.map((feature: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-[#FF7A00] rounded-full flex-shrink-0"></div>
                                <span className="text-gray-300 text-sm">{feature}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-6">
                        {isCurrentPlan ? (
                          // Current plan - show disabled button
                          <Button 
                            className="w-full py-3 bg-gray-600 text-gray-400 cursor-not-allowed hover:bg-gray-600"
                            disabled={true}
                          >
                            Current Plan
                          </Button>
                        ) : canUpgrade ? (
                          // User can upgrade to this plan (True Fan → The Whale)
                          <Button 
                            onClick={() => handleSubscriptionAction(plan)}
                            className="w-full py-3 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
                            disabled={isUpgrading}
                          >
                            {isUpgrading ? 'Processing...' : 'Upgrade Plan'}
                          </Button>
                        ) : isGuestUser ? (
                          // Guest user - show subscribe button for all paid plans
                          <Button 
                            onClick={() => handleSubscriptionAction(plan)}
                            className="w-full py-3 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
                            disabled={isUpgrading}
                          >
                            {isUpgrading ? 'Processing...' : 'Subscribe'}
                          </Button>
                        ) : (
                          // Fallback disabled button for invalid states
                          <Button 
                            className="w-full py-3 bg-gray-600 text-gray-400 cursor-not-allowed hover:bg-gray-600"
                            disabled={true}
                          >
                            Subscribe
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
              )}
            </div>
          );
        })()}
        
        {/* Credit Boosters Section - Only visible to paid subscribers */}
        {userSubscription && userSubscription.plan?.price_monthly > 0 && (
          <div className="mt-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Credit Booster Packs
              </h2>
              <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                Need more credits? Get instant credit boosts with our convenient one-time purchase packs.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* 12,000 Credits Pack */}
              <Card className="bg-[#1a1a2e] border-gray-700/50 relative overflow-hidden h-full flex flex-col">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#FF7A00]" />
                    12,000 Credits Pack
                  </CardTitle>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold text-[#FF7A00]">
                      $10.00
                      <span className="text-sm text-gray-400 font-normal ml-2">one-time</span>
                    </div>
                    <div className="text-lg text-gray-300">
                      12,000 Credits Added Instantly
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#FF7A00] rounded-full flex-shrink-0"></div>
                        <span className="text-gray-300 text-sm">Perfect for extended conversations</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#FF7A00] rounded-full flex-shrink-0"></div>
                        <span className="text-gray-300 text-sm">Credits never expire</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#FF7A00] rounded-full flex-shrink-0"></div>
                        <span className="text-gray-300 text-sm">Added to your account instantly</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <Button 
                      onClick={() => handleCreditPackPurchase('pack_12k')}
                      className="w-full py-3 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
                      disabled={isPurchasingCredits}
                    >
                      {isPurchasingCredits ? 'Processing...' : 'Buy Now'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 24,000 Credits Pack */}
              <Card className="bg-[#1a1a2e] border-gray-700/50 relative overflow-hidden h-full flex flex-col ring-2 ring-[#FF7A00]">
                <div className="absolute top-4 right-4">
                  <div className="bg-[#FF7A00] text-white px-2 py-1 rounded text-xs font-medium">
                    Best Value
                  </div>
                </div>
                
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#FF7A00]" />
                    24,000 Credits Pack
                  </CardTitle>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold text-[#FF7A00]">
                      $20.00
                      <span className="text-sm text-gray-400 font-normal ml-2">one-time</span>
                    </div>
                    <div className="text-lg text-gray-300">
                      24,000 Credits Added Instantly
                    </div>
                    <div className="text-sm text-green-400">
                      Save 17% vs 12k pack
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#FF7A00] rounded-full flex-shrink-0"></div>
                        <span className="text-gray-300 text-sm">Maximum value for heavy users</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#FF7A00] rounded-full flex-shrink-0"></div>
                        <span className="text-gray-300 text-sm">Credits never expire</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#FF7A00] rounded-full flex-shrink-0"></div>
                        <span className="text-gray-300 text-sm">Added to your account instantly</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <Button 
                      onClick={() => handleCreditPackPurchase('pack_24k')}
                      className="w-full py-3 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
                      disabled={isPurchasingCredits}
                    >
                      {isPurchasingCredits ? 'Processing...' : 'Buy Now'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        
        {/* Plan Comparison Section */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-center text-white mb-8">
            Compare Our Plans
          </h2>
          <FeatureComparisonTable plans={plans} />
        </div>
        
        {/* Upgrade Confirmation Dialog */}
        <AlertDialog open={showUpgradeConfirmation} onOpenChange={setShowUpgradeConfirmation}>
          <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Confirm Your Plan Upgrade</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-300">
                <div className="space-y-3">
                  <p>You are upgrading from <strong>True Fan</strong> to <strong>The Whale</strong> plan.</p>
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <p>• <strong>One-time charge:</strong> $10.00 (charged now)</p>
                    <p>• <strong>Credits bonus:</strong> 17,000 credits added immediately</p>
                    <p>• <strong>Next billing:</strong> $24.95/month starting next cycle</p>
                  </div>
                  <p className="text-sm text-gray-400">
                    Your subscription will continue with the new plan benefits and pricing.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-600 text-white hover:bg-gray-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => planToUpgradeTo && processSubscriptionAction(planToUpgradeTo)}
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
                disabled={isUpgrading}
              >
                {isUpgrading ? 'Processing...' : 'Proceed to Upgrade'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Payment Modal Overlay */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="bg-[#1a1a2e] border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Complete Your Payment</DialogTitle>
            </DialogHeader>
            <div className="py-6">
              <p className="text-gray-300 text-center">
                Please complete your transaction in the popup window. This dialog will close automatically when the payment is complete.
              </p>
              <div className="flex justify-center mt-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF7A00]"></div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default Subscription;