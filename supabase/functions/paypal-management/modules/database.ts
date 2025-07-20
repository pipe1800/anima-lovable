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
    .from('subscriptions')
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
  planId: string
): Promise<PlanRecord | null> {
  const { data, error } = await supabase
    .from('plans')
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
  creditPackId: string
): Promise<CreditPackRecord | null> {
  const { data, error } = await supabase
    .from('credit_packs')
    .select('*')
    .eq('id', creditPackId)
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
  }
) {
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert({
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
  status: string
) {
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: status,
      updated_at: new Date().toISOString()
    })
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
  userId: string,
  orderData: {
    paypal_order_id: string;
    credit_pack_id: string;
    amount: number;
    credits_granted: number;
    status: string;
  }
) {
  const { data, error } = await supabase
    .from('credit_purchases')
    .insert({
      user_id: userId,
      paypal_order_id: orderData.paypal_order_id,
      credit_pack_id: orderData.credit_pack_id,
      amount: orderData.amount,
      credits_granted: orderData.credits_granted,
      status: orderData.status,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating credit purchase:', error);
    throw new Error('Failed to create credit purchase record');
  }

  return data;
}

/**
 * Update credit purchase status
 */
export async function updateCreditPurchaseStatus(
  supabase: any,
  paypalOrderId: string,
  status: string
) {
  const { error } = await supabase
    .from('credit_purchases')
    .update({
      status: status,
      updated_at: new Date().toISOString()
    })
    .eq('paypal_order_id', paypalOrderId);

  if (error) {
    console.error('Error updating credit purchase status:', error);
    throw new Error('Failed to update credit purchase status');
  }
}

/**
 * Add credits to user account
 */
export async function addCreditsToUser(
  supabase: any,
  userId: string,
  creditsToAdd: number
) {
  // Get current credits
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();

  if (fetchError) {
    console.error('Error fetching user credits:', fetchError);
    throw new Error('Failed to fetch user credits');
  }

  const currentCredits = profile?.credits || 0;
  const newCredits = currentCredits + creditsToAdd;

  // Update credits
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (updateError) {
    console.error('Error updating user credits:', updateError);
    throw new Error('Failed to update user credits');
  }

  return { previousCredits: currentCredits, newCredits };
}

/**
 * Get subscription by PayPal subscription ID
 */
export async function getSubscriptionByPayPalId(
  supabase: any,
  paypalSubscriptionId: string
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plan:plans(*)')
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
export async function getCreditPurchaseByPayPalId(
  supabase: any,
  paypalOrderId: string
): Promise<CreditPurchaseRecord | null> {
  const { data, error } = await supabase
    .from('credit_purchases')
    .select('*')
    .eq('paypal_order_id', paypalOrderId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching credit purchase by PayPal ID:', error);
    return null;
  }

  return data;
}
