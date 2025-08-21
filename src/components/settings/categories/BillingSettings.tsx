import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getCreditPacks,
  getSubscriptionPlans,
  getUserCreditPurchases,
  getUserCredits,
  getUserSubscription,
} from '@/lib/supabase-queries';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

// Define types from the new billing schema
type Plan = Database['billing']['Tables']['plans']['Row'];
type Subscription = Database['billing']['Tables']['subscriptions']['Row'];
type CreditPack = Database['billing']['Tables']['credit_packs']['Row'];
type CreditPackPurchase = Database['billing']['Tables']['credit_pack_purchases']['Row'];

// Define more specific types for our component state
type SubscriptionWithPlan = Subscription & { plan: Plan | null };
type PurchaseWithPack = CreditPackPurchase & { credit_pack: { name: string; credits_granted: number } | null };

const BillingSettings = () => {
  const { session, user, supabase } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [credits, setCredits] = useState(0);
  const [purchases, setPurchases] = useState<PurchaseWithPack[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBillingData = async () => {
      if (user) {
        setLoading(true);
        try {
          const [subData, creditsData, purchasesData] = await Promise.all([
            getUserSubscription(supabase, user.id),
            getUserCredits(supabase, user.id),
            getUserCreditPurchases(supabase, user.id),
          ]);

          if (subData.error) throw subData.error;
          if (creditsData.error) throw creditsData.error;
          if (purchasesData.error) throw purchasesData.error;

          setSubscription(subData.data as SubscriptionWithPlan | null);
          setCredits(creditsData.data?.balance ?? 0);
          setPurchases((purchasesData.data as PurchaseWithPack[]) || []);
        } catch (err) {
          console.error('Error fetching billing data:', err);
          toast({
            title: 'Error',
            description: 'Could not load billing data. Please try again later.',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      }
    };

    const fetchPlans = async () => {
      try {
        const { data, error } = await getSubscriptionPlans(supabase);
        if (error) throw error;
        setPlans(data || []);
      } catch (err) {
        console.error('Error fetching subscription plans:', err);
        toast({
          title: 'Error',
          description: 'Could not load subscription plans. Please try again later.',
          variant: 'destructive',
        });
      }
    };

    const fetchCreditPacks = async () => {
      try {
        const { data, error } = await getCreditPacks(supabase);
        if (error) throw error;
        setCreditPacks(data || []);
      } catch (err) {
        console.error('Error fetching credit packs:', err);
        toast({
          title: 'Error',
          description: 'Could not load credit packs. Please try again later.',
          variant: 'destructive',
        });
      }
    };

    fetchBillingData();
    fetchPlans();
    fetchCreditPacks();

    const subChangeListener = supabase
      .channel('billing-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'billing',
          table: 'subscriptions',
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchBillingData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'billing',
          table: 'credits',
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchBillingData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'billing',
          table: 'credit_pack_purchases',
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchBillingData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subChangeListener);
    };
  }, [user, supabase, toast]);

  const handleManageSubscription = async () => {
    if (!subscription?.paypal_subscription_id) {
      toast({
        title: 'Error',
        description: 'No active subscription found.',
        variant: 'destructive',
      });
      return;
    }
    // Redirect to a page that handles PayPal subscription management
    // This would typically involve a server-side call to get a management link
    window.open(
      `https://www.paypal.com/myaccount/autopay/connect/${subscription.paypal_subscription_id}`,
      '_blank',
    );
  };

  const handleCancelSubscription = async () => {
    if (!subscription?.paypal_subscription_id) {
      toast({
        title: 'Error',
        description: 'No active subscription found.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-management`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'cancel_subscription',
            subscriptionId: subscription.paypal_subscription_id,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel subscription.');
      }
      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription has been successfully cancelled.',
      });
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast({
        variant: 'destructive',
        title: 'Cancellation Failed',
        description:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-management`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: 'create_subscription', planId }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.approval_url) {
        throw new Error(result.error || 'Failed to create subscription.');
      }
      // Redirect to PayPal for approval
      window.location.href = result.approval_url;
    } catch (error) {
      console.error('Error initiating subscription:', error);
      toast({
        variant: 'destructive',
        title: 'Subscription Failed',
        description:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred.',
      });
      setLoading(false);
    }
  };

  const handleBuyCredits = async (packId: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-management`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: 'create_order', packId }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.approval_url) {
        throw new Error(result.error || 'Failed to create credit order.');
      }
      // Redirect to PayPal for approval
      window.location.href = result.approval_url;
    } catch (error) {
      console.error('Error initiating credit purchase:', error);
      toast({
        variant: 'destructive',
        title: 'Purchase Failed',
        description:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred.',
      });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>My Subscription</CardTitle>
          <CardDescription>
            Manage your current plan and billing details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !subscription && <p>Loading subscription details...</p>}
          {!loading && subscription ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg">
                    {subscription.plan?.name || 'Unknown Plan'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Status: <span className={`capitalize ${subscription.status === 'active' ? 'text-green-500' : 'text-red-500'}`}>{subscription.status}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">
                    ${subscription.plan?.price_monthly}/month
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Renews on:{' '}
                    {new Date(
                      subscription.current_period_end,
                    ).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button onClick={handleManageSubscription} disabled={loading}>
                  Manage Subscription
                </Button>
                {subscription.status === 'active' && (
                  <Button
                    variant="destructive"
                    onClick={handleCancelSubscription}
                    disabled={loading}
                  >
                    {loading ? 'Cancelling...' : 'Cancel Subscription'}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            !loading && <p>You are not subscribed to any plan.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Credits</CardTitle>
          <CardDescription>
            Your current credit balance and purchase history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-4">{credits.toLocaleString()} Credits</div>
          <h3 className="font-semibold mb-2">Purchase History</h3>
          {purchases.length > 0 ? (
            <ul className="space-y-2">
              {purchases.map((purchase) => (
                <li key={purchase.id} className="flex justify-between items-center p-2 rounded-md bg-muted">
                  <div>
                    <p>{purchase.credit_pack?.name || 'Credit Purchase'}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(purchase.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>+{purchase.credits_granted.toLocaleString()} credits</p>
                    <p className="text-sm text-muted-foreground">
                      Status: <span className="capitalize">{purchase.status}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No credit purchase history.</p>
          )}
        </CardContent>
      </Card>

      {!subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a Plan</CardTitle>
            <CardDescription>
              Select a subscription plan to unlock more features and credits.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            {plans.map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription className="text-3xl font-bold">
                    ${plan.price_monthly}/month
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center">
                      <Check className="mr-2 h-4 w-4 text-green-500" />
                      {plan.monthly_credits_allowance.toLocaleString()} credits per month
                    </li>
                    {(Array.isArray(plan.features) ? plan.features : []).map((feature: any, i) => (
                      <li key={i} className="flex items-center">
                        <Check className="mr-2 h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Subscribe'}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buy More Credits</CardTitle>
          <CardDescription>
            Need a top-up? Purchase additional credits.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {creditPacks.map((pack) => (
            <Card key={pack.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{pack.name}</CardTitle>
                <CardDescription className="text-3xl font-bold">
                  ${pack.price_cents / 100}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-lg font-semibold text-center">
                  {pack.credits_granted.toLocaleString()} Credits
                </p>
                <p className="text-sm text-muted-foreground mt-2">{pack.description}</p>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  onClick={() => handleBuyCredits(pack.id)}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Buy Now'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingSettings;
