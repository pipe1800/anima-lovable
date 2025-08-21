// PayPal / Billing Edge Client (migrated from payments/client.ts) - 2025-08-21
// Use these wrappers for PayPal subscription & credit pack operations.
// Deprecated older import path: '@/data/payments/client' (still re-exported for now)

import { supabase } from '@/db/client';

interface PayPalResponse<T = any> { success: boolean; data?: T; error?: string; [k: string]: any } // eslint-disable-line @typescript-eslint/no-explicit-any

async function callPayPal<T = any>(operation: string, payload: Record<string, any> = {}): Promise<{ data: T | null; error: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    return { data: (json as any).result || (json.data as any) || json as any, error: null }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch (error) {
    return { data: null, error };
  }
}

// Subscription Operations ----------------------------------------------------
export const createSubscription = (planId: string, upgradeFromSubscriptionId?: string) => callPayPal('create-subscription', { planId, upgradeFromSubscriptionId });
export const verifySubscription = (subscriptionId: string, state?: string) => callPayPal('verify-subscription', { subscriptionId, state });
export const cancelSubscription = (subscriptionId: string) => callPayPal('cancel-subscription', { subscriptionId });
export const reviseSubscription = (subscriptionId: string, newPlanId: string) => callPayPal('revise-subscription', { subscriptionId, newPlanId });

// Order / Credit Pack Operations ---------------------------------------------
export const createCreditOrder = (creditPackId: string) => callPayPal('create-order', { creditPackId });
export const captureCreditOrder = (orderToken: string, payerId: string, creditPackId: string) => callPayPal('capture-order', { orderToken, payerId, creditPackId });

// Legacy naming shims --------------------------------------------------------
export const createSubscriptionLegacy = createSubscription;
export const verifySubscriptionLegacy = verifySubscription;

// Diagnostic helper
export const ping = () => callPayPal('webhook', { test: true });

export const PayPalClient = {
  createSubscription,
  verifySubscription,
  cancelSubscription,
  reviseSubscription,
  createCreditOrder,
  captureCreditOrder,
  ping
};
