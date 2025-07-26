import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreditCard, Loader2, Crown, Zap, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserSubscription, useAvailablePlans } from '@/hooks/useProfile';

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  monthly_credits_allowance: number;
  features: any;
  is_active: boolean;
}

interface UserSubscription {
  id: string;
  status: string;
  current_period_end: string;
  paypal_subscription_id: string | null;
  plan: Plan;
}

interface BillingHistoryItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  type: 'subscription' | 'credit_pack';
}

export const BillingSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUpgradeConfirmation, setShowUpgradeConfirmation] = useState(false);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [historyByYear, setHistoryByYear] = useState<Record<number, BillingHistoryItem[]>>({});
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  const { 
    data: userSubscription, 
    isLoading: subscriptionLoading,
    refetch: refetchSubscription 
  } = useUserSubscription();
  
  const { 
    data: availablePlans = [], 
    isLoading: plansLoading 
  } = useAvailablePlans();

  const loading = subscriptionLoading || plansLoading;

  // Fetch billing history
  useEffect(() => {
    const fetchBillingHistory = async () => {
      if (!user) return;
      
      try {
        setHistoryLoading(true);
        
        // Fetch subscription history
        const { data: subscriptions, error: subError } = await supabase
          .from('subscriptions')
          .select(`
            id,
            created_at,
            status,
            plan:plans(name, price_monthly)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (subError) {
          console.error('Error fetching subscriptions:', subError);
        }

        // Fetch credit pack purchases
        const { data: creditPurchases, error: creditError } = await supabase
          .from('credit_pack_purchases')
          .select(`
            id,
            created_at,
            amount_paid,
            status,
            credit_pack:credit_packs(name, credits_granted)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (creditError) {
          console.error('Error fetching credit purchases:', creditError);
        }

        // Combine and format billing history
        const history: BillingHistoryItem[] = [];

        // Add subscription entries
        if (subscriptions) {
          subscriptions.forEach(sub => {
            if (sub.plan) {
              history.push({
                id: sub.id,
                date: sub.created_at,
                description: `${sub.plan.name} Subscription`,
                amount: sub.plan.price_monthly || 0,
                status: sub.status,
                type: 'subscription'
              });
            }
          });
        }

        // Add credit pack purchases
        if (creditPurchases) {
          creditPurchases.forEach(purchase => {
            if (purchase.credit_pack) {
              history.push({
                id: purchase.id,
                date: purchase.created_at,
                description: `${purchase.credit_pack.name} (${purchase.credit_pack.credits_granted.toLocaleString()} credits)`,
                amount: purchase.amount_paid,
                status: purchase.status,
                type: 'credit_pack'
              });
            }
          });
        }

        // Sort by date descending
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Group billing history by year
        const historyByYearMap: Record<number, BillingHistoryItem[]> = {};
        history.forEach(item => {
          const year = new Date(item.date).getFullYear();
          if (!historyByYearMap[year]) {
            historyByYearMap[year] = [];
          }
          historyByYearMap[year].push(item);
        });

        // Get available years and sort them in descending order (newest first)
        const years = Object.keys(historyByYearMap)
          .map(year => parseInt(year))
          .sort((a, b) => b - a);

        setBillingHistory(history);
        setHistoryByYear(historyByYearMap);
        setAvailableYears(years);
        
        // Reset to page 1 if current page is beyond available pages
        if (currentPage > years.length) {
          setCurrentPage(1);
        }
      } catch (error) {
        console.error('Error fetching billing history:', error);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchBillingHistory();
  }, [user, currentPage]);

  // Utility functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTypeIcon = (type: 'subscription' | 'credit_pack') => {
    if (type === 'subscription') {
      return <Calendar className="h-4 w-4 text-blue-500" />;
    }
    return <CreditCard className="h-4 w-4 text-purple-500" />;
  };

  // Get current year's data for display
  const getCurrentYearData = () => {
    if (availableYears.length === 0) return { year: new Date().getFullYear(), items: [] };
    
    const currentYearIndex = currentPage - 1;
    const year = availableYears[currentYearIndex];
    const items = historyByYear[year] || [];
    
    return { year, items };
  };

  const canGoToPreviousPage = () => currentPage > 1;
  const canGoToNextPage = () => currentPage < availableYears.length;

  const goToPreviousPage = () => {
    if (canGoToPreviousPage()) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (canGoToNextPage()) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleUpgradeClick = () => {
    setShowUpgradeConfirmation(true);
  };

  const handleUpgrade = async () => {
    setIsChangingPlan(true);
    setShowUpgradeConfirmation(false);
    try {
      // Find The Whale plan ID
      const whalePlan = availablePlans.find(plan => plan.name === 'The Whale');
      if (!whalePlan) {
        throw new Error('The Whale plan not found');
      }

      if (!userSubscription?.paypal_subscription_id) {
        throw new Error('No PayPal subscription ID found');
      }

      console.log('🚀 Starting upgrade process:', {
        whalePlanId: whalePlan.id,
        whalePlanName: whalePlan.name,
        currentSubscriptionId: userSubscription.paypal_subscription_id,
        currentPlanName: userSubscription.plan.name
      });

      // Create upgrade subscription using the special upgrade plan
      const { data, error } = await supabase.functions.invoke('paypal-management', {
        body: {
          operation: 'create-subscription',
          planId: whalePlan.id, // We'll map this to the upgrade PayPal plan in the backend
          upgradeFromSubscriptionId: userSubscription.paypal_subscription_id // Pass the current subscription to upgrade from
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        if (data.data?.requires_approval && data.data?.approve_url) {
          // PayPal requires approval - open approval URL
          const approvalUrl = data.data.approve_url;
          const width = 600;
          const height = 800;
          const left = (window.screen.width / 2) - (width / 2);
          const top = (window.screen.height / 2) - (height / 2);
          
          setShowPaymentModal(true);
          
          const popup = window.open(
            approvalUrl,
            'paypal-approval',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
          );
          
          // Set up message listener for popup communication
          const handleMessage = (event: MessageEvent) => {
            if (event.data?.paypal_status === 'success') {
              // Payment successful, clean up and redirect
              window.removeEventListener('message', handleMessage);
              setShowPaymentModal(false);
              setIsChangingPlan(false);
              // Refresh subscription data
              refetchSubscription();
              toast({
                title: "Upgrade Successful!",
                description: "Your plan has been upgraded to The Whale.",
              });
            }
          };
          
          window.addEventListener('message', handleMessage);
          
          // Check if popup was closed without completion
          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed);
              window.removeEventListener('message', handleMessage);
              setShowPaymentModal(false);
              setIsChangingPlan(false);
            }
          }, 1000);
        } else {
          // Upgrade completed immediately without approval needed
          setIsChangingPlan(false);
          await refetchSubscription();
          toast({
            title: "Upgrade Successful!",
            description: "Your plan has been upgraded to The Whale.",
          });
        }
      } else {
        throw new Error('Upgrade failed');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not start the upgrade process. Please try again.",
        variant: "destructive"
      });
      setIsChangingPlan(false);
    }
  };


  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('paypal-management', {
        body: {
          operation: 'cancel-subscription'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        toast({
          title: "Subscription Cancelled",
          description: "Your subscription has been cancelled and you've been automatically moved to the Guest Pass plan.",
        });
        // Refresh the subscription data
        await refetchSubscription();
      }
    } catch (error) {
      console.error('Cancellation error:', error);
      toast({
        title: "Error", 
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Billing Settings</h2>
        <p className="text-gray-300">Manage your subscription and payment information</p>
      </div>

      <div className="space-y-6">
        {/* Current Plan */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Current Plan</h3>
          
          {userSubscription ? (
            <div className="bg-gray-800/50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {userSubscription.plan.name === 'The Whale' ? (
                    <Crown className="w-6 h-6 text-[#FF7A00]" />
                  ) : (
                    <Zap className="w-6 h-6 text-[#FF7A00]" />
                  )}
                  <div>
                    <h4 className="text-white font-medium">{userSubscription.plan.name}</h4>
                    <p className="text-gray-400 text-sm">
                      {userSubscription.plan.monthly_credits_allowance.toLocaleString()} credits/month
                    </p>
                  </div>
                </div>
                <Badge className={`${userSubscription.status === 'active' ? 'bg-green-600' : 'bg-yellow-600'} text-white`}>
                  {userSubscription.status === 'active' ? 'Active' : userSubscription.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">
                  Next billing date: {formatDate(userSubscription.current_period_end)}
                </span>
                <span className="text-white font-semibold">
                  ${userSubscription.plan.price_monthly}/month
                </span>
              </div>

              {/* Show upgrade button only if the current plan is 'True Fan' */}
              {userSubscription.plan.name === 'True Fan' && (
                <>
                  <Separator className="bg-gray-700 my-4" />
                  <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-orange-200">Upgrade to The Whale</h5>
                      <p className="text-sm text-orange-300">Get 17,000 more credits instantly for a one-time payment of $10.00.</p>
                    </div>
                    <Button
                      onClick={handleUpgradeClick}
                      disabled={isChangingPlan}
                      className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
                    >
                      {isChangingPlan ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Upgrade Now'
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="bg-gray-800/50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-white font-medium">Guest Pass (Free)</h4>
                  <p className="text-gray-400 text-sm">Limited features</p>
                </div>
                <Badge className="bg-gray-600 text-white">Free</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">No active subscription</span>
                <span className="text-white font-semibold">$0/month</span>
              </div>
            </div>
          )}

          {userSubscription && userSubscription.status === 'active' && (
            <div className="mt-4 flex gap-3">
              {/* Upgrade Plan Button for True Fan users */}
              {userSubscription.plan.name === 'True Fan' && (
                <Button 
                  onClick={handleUpgradeClick}
                  disabled={isChangingPlan}
                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
                >
                  {isChangingPlan ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Upgrade to The Whale'
                  )}
                </Button>
              )}
              
              {/* Cancel Subscription Dialog - Only show for active subscriptions with PayPal ID */}
              {userSubscription && userSubscription.paypal_subscription_id && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="border-red-600 text-red-400 hover:bg-red-600/10">
                      Cancel Subscription
                    </Button>
                  </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Cancel Subscription</AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-300">
                      Are you sure you want to cancel your subscription? You'll continue to have access to your plan features until {formatDate(userSubscription.current_period_end)}, after which you'll be automatically moved to the Guest Pass plan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  
                  <div className="py-4">
                    <div className="text-gray-300 mb-3">
                      <span className="font-medium">When you cancel, you'll be moved to the Guest Pass plan and lose access to the following premium benefits:</span>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      {userSubscription.plan.features && 
                       typeof userSubscription.plan.features === 'object' && 
                       userSubscription.plan.features !== null &&
                       'features' in userSubscription.plan.features &&
                       Array.isArray((userSubscription.plan.features as any).features) ? (
                        <ul className="space-y-1">
                          {((userSubscription.plan.features as any).features as string[]).map((feature: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-red-400 mt-1">•</span>
                              <span className="text-sm text-gray-300">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-sm text-gray-300">All premium features and benefits</span>
                      )}
                    </div>
                    
                    <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                      <p className="text-sm text-blue-300">
                        <strong>Guest Pass includes:</strong> Basic chat functionality with limited credits and features.
                      </p>
                    </div>
                  </div>
                  
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-gray-600 text-white hover:bg-gray-800">
                      Keep Subscription
                    </AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleCancelSubscription}
                      disabled={isCancelling}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {isCancelling ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        'Yes, Cancel Subscription'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>

        <Separator className="bg-gray-700" />

        {/* Billing History */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Billing History</h3>
            
            {/* Year pagination controls */}
            {availableYears.length > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={!canGoToPreviousPage()}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <span className="text-sm text-gray-300 px-2">
                  {getCurrentYearData().year}
                </span>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={!canGoToNextPage()}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          {historyLoading ? (
            <div className="bg-gray-800/50 rounded-lg p-6 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-400">Loading billing history...</span>
            </div>
          ) : billingHistory.length === 0 ? (
            <div className="bg-gray-800/50 rounded-lg p-6 text-center">
              <CreditCard className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-400">No billing history found</p>
              <p className="text-sm text-gray-500 mt-1">Your transaction history will appear here</p>
            </div>
          ) : getCurrentYearData().items.length === 0 ? (
            <div className="bg-gray-800/50 rounded-lg p-6 text-center">
              <Calendar className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-400">No transactions in {getCurrentYearData().year}</p>
              <p className="text-sm text-gray-500 mt-1">Use the navigation above to view other years</p>
            </div>
          ) : (
            <div className="bg-gray-800/50 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {getCurrentYearData().items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-700/30">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getTypeIcon(item.type)}
                            <span className="ml-2 text-sm text-gray-300">
                              {formatDate(item.date)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-white">{item.description}</span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-white">
                            ${item.amount.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {getStatusBadge(item.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Year summary and pagination info */}
              {availableYears.length > 1 && (
                <div className="px-4 py-3 bg-gray-700/30 border-t border-gray-700">
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>
                      {getCurrentYearData().items.length} transactions in {getCurrentYearData().year}
                    </span>
                    <span>
                      Page {currentPage} of {availableYears.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
              onClick={handleUpgrade}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
              disabled={isChangingPlan}
            >
              {isChangingPlan ? 'Processing...' : 'Proceed to Upgrade'}
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
