import type { 
  SubscriptionRecord, 
  CreditPurchaseRecord, 
  PlanRecord, 
  CreditPackRecord 
} from '../types/index.ts';

/**
 * Get user's active subscription
 */
export async function getUserActiveSubscription(
  supabase: any, 
  userId: string
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabase
    .from('billing.subscriptions')
    .select('*, plan:plans(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('Error fetching user subscription:', error);
    throw new Error('Failed to fetch subscription data');
  }

  return data;
}

/**
 * Get plan details by ID
 */
export async function getPlanById(
  supabase: any, 
  planId: string,
): Promise<PlanRecord | null> {
  const { data, error } = await supabase
    .from('billing.plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) {
    console.error('Error fetching plan:', error);
    throw new Error(`Plan not found: ${error.message}`);
  }

  return data;
}

/**
 * Get credit pack details by ID
 */
export async function getCreditPackById(
  supabase: any, 
  packId: string,
): Promise<CreditPackRecord | null> {
  const { data, error } = await supabase
    .from('billing.credit_packs')
    .select('*')
    .eq('id', packId)
    .single();

  if (error) {
    console.error('Error fetching credit pack:', error);
    throw new Error(`Credit pack not found: ${error.message}`);
  }

  return data;
}

/**
 * Create or update subscription record
 */
export async function upsertSubscription(
  supabase: any,
  userId: string,
  subscriptionData: {
    paypal_subscription_id: string;
    plan_id: string;
    status: string;
    start_time?: string;
  },
) {
  const { data, error } = await supabase
    .from('billing.subscriptions')
    .upsert(
      {
        user_id: userId,
        paypal_subscription_id: subscriptionData.paypal_subscription_id,
        plan_id: subscriptionData.plan_id,
        status: subscriptionData.status,
        created_at: subscriptionData.start_time || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
      onConflict: 'user_id,paypal_subscription_id'
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting subscription:', error);
    throw new Error('Failed to save subscription');
  }

  return data;
}

/**
 * Update subscription status
 */
export async function updateSubscriptionStatus(
  supabase: any,
  paypalSubscriptionId: string,
  status: string,
) {
  const { error } = await supabase
    .from('billing.subscriptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('paypal_subscription_id', paypalSubscriptionId);

  if (error) {
    console.error('Error updating subscription status:', error);
    throw new Error('Failed to update subscription status');
  }
}

/**
 * Create credit purchase record
 */
export async function createCreditPurchase(
  supabase: any,
  orderData: {
    user_id: string;
    credit_pack_id: string;
    paypal_order_id: string;
    amount_paid: number;
    credits_granted: number;
    status: string;
  },
) {
  const { data, error } = await supabase
    .from('billing.credit_pack_purchases')
    .insert([
      {
        user_id: orderData.user_id,
        credit_pack_id: orderData.credit_pack_id,
        paypal_order_id: orderData.paypal_order_id,
        amount_paid: orderData.amount_paid,
        credits_granted: orderData.credits_granted,
        status: orderData.status,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating credit purchase:', error);
    throw new Error('Failed to create credit purchase record');
  }

  return data;
}

/**
 * Add credits to user account (wrapper around add_user_credits RPC)
 */
export async function addCreditsToUser(
  supabase: any,
  userId: string,
  creditsToAdd: number,
  referenceId?: string,
  transactionType: string = 'subscription_allowance'
) {
  if (!creditsToAdd || creditsToAdd <= 0) {
    return { newBalance: null };
  }
  const { data, error } = await supabase.rpc('add_user_credits', {
    p_user_id: userId,
    p_amount: creditsToAdd,
    p_transaction_type: transactionType,
    p_reference_id: referenceId || null,
  });
  if (error) {
    console.error('Error granting user credits via RPC:', error);
    throw new Error('Failed to grant credits');
  }
  return { newBalance: data };
}

/**
 * Get subscription by PayPal subscription ID
 */
export async function getSubscriptionByPayPalId(
  supabase: any,
  paypalSubscriptionId: string,
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabase
    .from('billing.subscriptions')
    .select('*')
    .eq('paypal_subscription_id', paypalSubscriptionId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching subscription by PayPal ID:', error);
    return null;
  }

  return data;
}

/**
 * Get credit purchase by PayPal order ID
 */
export async function getCreditPurchaseByPaypalId(
  supabase: any,
  paypalOrderId: string,
): Promise<CreditPurchaseRecord | null> {
  const { data, error } = await supabase
    .from('billing.credit_pack_purchases')
    .select('*')
    .eq('paypal_order_id', paypalOrderId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching credit purchase by PayPal ID:', error);
    return null;
  }

  return data;
}

/**
 * Get active subscriptions for a user
 */
export async function getActiveSubscriptions(
  supabase: any,
  userId: string,
): Promise<SubscriptionRecord[]> {
  const { data, error } = await supabase
    .from('billing.subscriptions')
    .select('*, plan:plans(*)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error('Error fetching active subscriptions:', error);
    throw new Error('Failed to fetch active subscriptions');
  }

  return data;
}

/**
 * Update credit purchase status
 */
export async function updateCreditPurchaseStatus(
  supabase: any,
  paypalOrderId: string,
  status: string,
) {
  const { error } = await supabase
    .from('billing.credit_pack_purchases')
    .update({ status })
    .eq('paypal_order_id', paypalOrderId);

  if (error) {
    console.error('Error updating credit purchase status:', error);
    throw new Error('Failed to update credit purchase status');
  }
}
