// Compatibility PayPal Payments client (2025-08-21)
// Replaces removed ./payments/queries module. Pages still importing { Payments } from '@/data'
// now receive these wrappers that call the unified edge function `paypal-management`.
// TODO: After migrating pages, call Billing.* directly where possible or rename to PayPal.

import { supabase } from '@/db/client';

interface PayPalResponse<T = any> { success: boolean; data?: T; error?: string; [k: string]: any }

async function callPayPal<T = any>(operation: string, payload: Record<string, any> = {}): Promise<{ data: T | null; error: any }>{
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/functions/v1/paypal-management', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({ operation, ...payload })
    });
    const json: PayPalResponse<T> = await res.json();
    if (!res.ok || json.success === false) {
      return { data: null, error: json.error || res.statusText };
    }
    return { data: (json as any).result || (json.data as any) || json as any, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// Subscription Operations ----------------------------------------------------
export async function createSubscription(planId: string, upgradeFromSubscriptionId?: string) {
  return callPayPal('create-subscription', { planId, upgradeFromSubscriptionId });
}

export async function verifySubscription(subscriptionId: string, state?: string) {
  return callPayPal('verify-subscription', { subscriptionId, state });
}

export async function cancelSubscription(subscriptionId: string) {
  return callPayPal('cancel-subscription', { subscriptionId });
}

export async function reviseSubscription(subscriptionId: string, newPlanId: string) {
  return callPayPal('revise-subscription', { subscriptionId, newPlanId });
}

// Order / Credit Pack Operations ---------------------------------------------
export async function createCreditOrder(creditPackId: string) {
  return callPayPal('create-order', { creditPackId });
}

export async function captureCreditOrder(orderToken: string, payerId: string, creditPackId: string) {
  return callPayPal('capture-order', { orderToken, payerId, creditPackId });
}

// Legacy naming shims (if older code used different param names) -------------
export const createSubscriptionLegacy = createSubscription;
export const verifySubscriptionLegacy = verifySubscription;

// Diagnostic helper
export async function ping() { return callPayPal('webhook', { test: true }); }

