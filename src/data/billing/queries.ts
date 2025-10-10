import { supabase } from '@/db/client';

import { callRpc, getSchemaClient, type SupabaseDatabaseClient } from '@/db/rpc';
import type { Json } from '@/integrations/supabase/types';

const billing = getSchemaClient(supabase, 'billing');

interface BillingPlan {
  id: string;
  name: string;
  price_monthly?: number | null;
  price_yearly?: number | null;
  model_id?: string | null;
  is_active?: boolean | null;
}

interface BillingModel {
  id: string;
  name: string;
  provider_model_id?: string | null;
}

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
  plans.forEach((p) => {
    if (!p.model_id) return;
    const existing = plansByModel.get(p.model_id);
    if (!existing || (p.price_monthly ?? 0) < (existing.price_monthly ?? 0)) {
      plansByModel.set(p.model_id, p);
    }
  });
  const enriched = models.map((m) => ({ ...m, min_plan: plansByModel.get(m.id) || null }));
  return { data: enriched, error: null };
};

export const getSubscriptionPlans = async (client: SupabaseDatabaseClient) => {
  const billingLocal = getSchemaClient(client, 'billing');
  const { data, error } = await billingLocal
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });
  return { data: data || [], error };
};

export const getCreditPacks = async (client: SupabaseDatabaseClient) => {
  const billingLocal = getSchemaClient(client, 'billing');
  const { data, error } = await billingLocal
    .from('credit_packs')
    .select('*')
    .eq('is_active', true)
    .order('price_cents', { ascending: true });
  return { data: data || [], error };
};

export const getUserSubscription = async (client: SupabaseDatabaseClient, userId: string) => {
  const { data, error } = await callRpc<Json | null>(client, 'get_user_subscription_with_plan', {
    p_user_id: userId,
  });
  if (error) return { data: null, error };
  return { data, error: null };
};

export const getUserCredits = async (client: SupabaseDatabaseClient | undefined, userId: string) => {
  const activeClient = (client ?? supabase) as SupabaseDatabaseClient;
  const { data, error } = await callRpc<number>(activeClient, 'get_user_credits', {
    p_user_id: userId,
  });
  if (error) return { data: { balance: 0 }, error };
  return { data: { balance: data }, error: null };
};

export const getUserCreditPurchases = async (
  client: SupabaseDatabaseClient,
  userId: string,
  limit = 25,
) => {
  const { data, error } = await callRpc<Json[] | Json | null>(client, 'get_user_credit_purchases', {
    p_user_id: userId,
    p_limit: limit,
  });
  if (error) return { data: [], error };
  const purchases = Array.isArray(data) ? data : (data ? [data] : []);
  return { data: purchases, error: null };
};

export interface UserBillingOverviewResult {
  subscription: Json | null;
  credits: number;
  purchases: Json[];
  plans: Json[];
  credit_packs: Json[];
  models: Json[];
}

export const getUserBillingOverview = async (
  client: SupabaseDatabaseClient,
  userId: string,
  purchasesLimit = 25,
) => {
  const { data, error } = await callRpc<UserBillingOverviewResult | null>(client, 'get_user_billing_overview', {
    p_user_id: userId,
    p_purchases_limit: purchasesLimit,
  });
  if (error) return { data: null, error };
  return { data: data as UserBillingOverviewResult, error: null };
};

export const getUserBillingOverviewForUser = async (userId: string, purchasesLimit = 25) =>
  getUserBillingOverview(supabase, userId, purchasesLimit);

export const subscribeToUserBillingChanges = (
  client: SupabaseDatabaseClient,
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
