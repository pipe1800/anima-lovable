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
import { Billing } from '@/data';
import { PayPalManagement } from '@/data/edge';
import { useAuth } from '@/contexts/AuthContext';

// Define types from the new billing schema
type Plan = {
  id: string;
  name: string;
  price_monthly: number | null;
  monthly_credits_allowance: number;
  features: string[] | null;
};

// Define more specific types for our component state
type SubscriptionWithPlan = {
  id: string;
  status: string;
  paypal_subscription_id: string | null;
  current_period_end: string | null;
  plan: Plan | null;
};
type CreditPack = {
  id: string;
  name: string;
  price_cents: number;
  credits_granted: number;
  description: string | null;
};
type PurchaseWithPack = {
  id: string;
  created_at: string;
  credits_granted: number;
  status: string;
  credit_pack: { name: string; credits_granted: number } | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizePlan = (value: unknown): Plan | null => {
  if (!isRecord(value)) return null;
  const { id, name } = value;
  if (typeof id !== 'string' || typeof name !== 'string') return null;

  const price = typeof value.price_monthly === 'number' ? value.price_monthly : null;
  const allowance = typeof value.monthly_credits_allowance === 'number' ? value.monthly_credits_allowance : 0;
  const features = Array.isArray(value.features)
    ? value.features.filter((feature): feature is string => typeof feature === 'string')
    : null;

  return {
    id,
    name,
    price_monthly: price,
    monthly_credits_allowance: allowance,
    features,
  };
};

const normalizeSubscription = (value: unknown): SubscriptionWithPlan | null => {
  if (!isRecord(value) || typeof value.id !== 'string') return null;

  return {
    id: value.id,
    status: typeof value.status === 'string' ? value.status : 'unknown',
    paypal_subscription_id: typeof value.paypal_subscription_id === 'string' ? value.paypal_subscription_id : null,
    current_period_end: typeof value.current_period_end === 'string' ? value.current_period_end : null,
    plan: normalizePlan(value.plan ?? null),
  };
};

const normalizeCreditPack = (value: unknown): CreditPack | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;

  return {
    id: value.id,
    name: value.name,
    price_cents: typeof value.price_cents === 'number' ? value.price_cents : 0,
    credits_granted: typeof value.credits_granted === 'number' ? value.credits_granted : 0,
    description: typeof value.description === 'string' ? value.description : null,
  };
};

const normalizePurchasePack = (value: unknown): { name: string; credits_granted: number } | null => {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  const credits = typeof value.credits_granted === 'number' ? value.credits_granted : 0;
  return { name: value.name, credits_granted: credits };
};

const normalizePurchase = (value: unknown): PurchaseWithPack | null => {
  if (!isRecord(value) || typeof value.id !== 'string') return null;

  return {
    id: value.id,
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    credits_granted: typeof value.credits_granted === 'number' ? value.credits_granted : 0,
    status: typeof value.status === 'string' ? value.status : 'unknown',
    credit_pack: normalizePurchasePack(value.credit_pack ?? null),
  };
};

const BillingSettings = () => {
  const { user, supabase } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [credits, setCredits] = useState(0);
  const [purchases, setPurchases] = useState<PurchaseWithPack[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBillingOverview = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await Billing.getUserBillingOverview(supabase, user.id, 50);
        if (error) throw error;
        if (data) {
          setSubscription(normalizeSubscription(data.subscription));
          setCredits(typeof data.credits === 'number' ? data.credits : 0);
          setPurchases(
            (Array.isArray(data.purchases) ? data.purchases : [])
              .map(normalizePurchase)
              .filter((purchase): purchase is PurchaseWithPack => purchase !== null),
          );
          setPlans(
            (Array.isArray(data.plans) ? data.plans : [])
              .map(normalizePlan)
              .filter((plan): plan is Plan => plan !== null),
          );
          setCreditPacks(
            (Array.isArray(data.credit_packs) ? data.credit_packs : [])
              .map(normalizeCreditPack)
              .filter((pack): pack is CreditPack => pack !== null),
          );
        }
      } catch (err) {
        console.error('Error fetching billing overview:', err);
        toast({
          title: 'Error',
          description: 'Could not load billing data. Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBillingOverview();

    // Realtime subscription: re-fetch overview on change
    let unsubscribe: (() => void) | undefined;
    if (user && supabase) {
      unsubscribe = Billing.subscribeToUserBillingChanges(supabase, user.id, fetchBillingOverview);
    }
    return () => { if (unsubscribe) unsubscribe(); };
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
      const { data, error } = await PayPalManagement.verifySubscription({ subscriptionId: subscription.paypal_subscription_id });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to cancel subscription.');
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
      const { data, error } = await PayPalManagement.createSubscription({ planId });
      if (error || !data?.data?.approval_url) throw new Error(data?.error || error?.message || 'Failed to create subscription.');
      window.location.href = data.data.approval_url;
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
      const { data, error } = await PayPalManagement.createCreditOrder({ creditPackId: packId });
      if (error || !data?.data?.approval_url) throw new Error(data?.error || error?.message || 'Failed to create credit order.');
      window.location.href = data.data.approval_url;
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
                    ${(subscription.plan?.price_monthly ?? 0).toFixed(2)}/month
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Renews on:{' '}
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : '—'}
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
                    ${(plan.price_monthly ?? 0).toFixed(2)}/month
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center">
                      <Check className="mr-2 h-4 w-4 text-green-500" />
                      {plan.monthly_credits_allowance.toLocaleString()} credits per month
                    </li>
                    {(plan.features ?? []).map((feature, index) => (
                      <li key={`${plan.id}-feature-${index}`} className="flex items-center">
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
                <p className="text-sm text-muted-foreground mt-2">{pack.description ?? 'No description provided.'}</p>
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
