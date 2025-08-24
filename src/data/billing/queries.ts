import { supabase } from '@/db/client';
import { SupabaseClient } from '@supabase/supabase-js';

const rootClient: any = supabase;
const billing = rootClient.schema ? rootClient.schema('billing') : rootClient;
interface BillingPlan { id: string; name: string; price_monthly?: number | null; price_yearly?: number | null; model_id?: string | null; is_active?: boolean | null; }
interface BillingModel { id: string; name: string; provider_model_id?: string | null; }

export const getActiveModels = async () => {
  const { data: modelsRaw, error } = await billing
    .from('models')
    .select('id, name, provider_model_id');
  if (error || !modelsRaw) return { data: [], error };
  const models = modelsRaw as BillingModel[];
  const { data: plansRaw } = await billing
    .from('plans')
    .select('id, name, price_monthly, price_yearly, model_id, is_active')
    .eq('is_active', true);
  const plans = (plansRaw || []) as BillingPlan[];
  const plansByModel = new Map<string, BillingPlan>();
  plans.forEach(p => {
    if (!p.model_id) return;
    const existing = plansByModel.get(p.model_id);
    if (!existing || (p.price_monthly ?? 0) < (existing.price_monthly ?? 0)) {
      plansByModel.set(p.model_id, p);
    }
  });
  const enriched = models.map(m => ({ ...m, min_plan: plansByModel.get(m.id) || null }));
  return { data: enriched, error: null };
};

export const getSubscriptionPlans = async (client: SupabaseClient) => {
  const billingLocal = (client as any).schema ? (client as any).schema('billing') : (client as any);
  const { data, error } = await billingLocal
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });
  return { data: data || [], error };
};

export const getCreditPacks = async (client: SupabaseClient) => {
  const billingLocal = (client as any).schema ? (client as any).schema('billing') : (client as any);
  const { data, error } = await billingLocal
    .from('credit_packs')
    .select('*')
    .eq('is_active', true)
    .order('price_cents', { ascending: true });
  return { data: data || [], error };
};

export const getUserSubscription = async (client: SupabaseClient, userId: string) => {
  const { data, error } = await client.rpc('get_user_subscription_with_plan', { p_user_id: userId });
  if (error) return { data: null, error };
  return { data, error: null };
};

export const getUserCredits = async (client: SupabaseClient | undefined, userId: string) => {
  const c: any = client || supabase;
  const { data, error } = await c.rpc('get_user_credits', { p_user_id: userId });
  if (error) return { data: { balance: 0 }, error };
  return { data: { balance: data }, error: null };
};

export const getUserCreditPurchases = async (client: SupabaseClient, userId: string, limit = 25) => {
  const { data, error } = await client.rpc('get_user_credit_purchases', { p_user_id: userId, p_limit: limit });
  if (error) return { data: [], error };
  const purchases = Array.isArray(data) ? data : (data ? [data] : []);
  return { data: purchases, error: null };
};

export interface UserBillingOverviewResult {
  subscription: any | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  credits: number;
  purchases: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  plans: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  credit_packs: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  models: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const getUserBillingOverview = async (client: SupabaseClient, userId: string, purchasesLimit = 25) => {
  const { data, error } = await client.rpc('get_user_billing_overview', { p_user_id: userId, p_purchases_limit: purchasesLimit });
  if (error) return { data: null, error };
  return { data: data as UserBillingOverviewResult, error: null };
};

export const getUserBillingOverviewForUser = async (userId: string, purchasesLimit = 25) => getUserBillingOverview(supabase as any, userId, purchasesLimit);

export const subscribeToUserBillingChanges = (
  client: SupabaseClient,
  userId: string,
  onChange: () => void
) => {
  const channel = client
    .channel(`billing-changes-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'billing', table: 'subscriptions', filter: `user_id=eq.${userId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'billing', table: 'credits', filter: `user_id=eq.${userId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'billing', table: 'credit_pack_purchases', filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};
