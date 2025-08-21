import { supabase } from '@/db/client';
import { SupabaseClient } from '@supabase/supabase-js';

const rootClient: any = supabase;
const billing = rootClient.schema ? rootClient.schema('billing') : rootClient;
interface BillingPlan { id: string; name: string; price_monthly?: number | null; price_yearly?: number | null; model_id?: string | null; is_active?: boolean | null; }
interface BillingModel { id: string; name: string; provider_model_id?: string | null; }

export const getActivePlans = async () => {
  const { data, error } = await billing
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });
  return { data, error };
};

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

export const getActiveCreditPacks = async () => {
  const { data, error } = await billing
    .from('credit_packs')
    .select('*')
    .eq('is_active', true)
    .order('price_cents', { ascending: true });
  return { data, error };
};

export const getUserActiveSubscription = async (userId: string) => {
  const { data: sub, error } = await billing
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !sub) return { data: null, error };
  let plan: BillingPlan | null = null;
  if ((sub as any).plan_id) {
    const { data: planData } = await billing
      .from('plans')
      .select('*')
      .eq('id', (sub as any).plan_id)
      .maybeSingle();
    plan = planData as BillingPlan | null;
  }
  return { data: { ...sub, plan }, error: null };
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
  const { data, error } = await c.from('user_credit_balances').select('*').eq('user_id', userId).maybeSingle();
  return { data, error };
 }

export const getUserCreditPurchases = async (client: SupabaseClient, userId: string) => {
  const { data, error } = await client.rpc('get_user_credit_purchases', { p_user_id: userId });
  if (error) return { data: [], error };
  const purchases = Array.isArray(data) ? data : (data ? [data] : []);
  return { data: purchases, error: null };
};

// Convenience wrappers for page layer (no direct client passing)
export const getUserSubscriptionForUser = async (userId: string) => getUserSubscription(supabase as any, userId);
export const getUserCreditsForUser = async (userId: string) => getUserCredits(supabase as any, userId);

/**
 * Subscribe to realtime billing-related changes for a specific user.
 * Consolidates component-level supabase.channel usage.
 * Returns an unsubscribe function.
 */
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
