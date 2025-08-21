import { getPayPalAccessToken } from './paypal-client.ts';
import type { 
  PayPalManagementRequest, 
  PayPalResponse,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  VerifySubscriptionRequest,
  CancelSubscriptionRequest,
  CancelSubscriptionResponse,
  ReviseSubscriptionRequest,
  SaveSubscriptionRequest,
  PlanRecord
} from '../types/index.ts';
import { cancelPayPalSubscription } from './paypal-client.ts';
import {
  addCreditsToUser,
  getPlanById,
  updateSubscriptionStatus,
  upsertSubscription,
} from './database.ts';

/**
 * Subscription Operations Handler
 * 
 * Extracted from existing working functions:
 * - create-paypal-subscription/index.ts (147 lines)
 * - verify-paypal-subscription/index.ts (261 lines) 
 * - cancel-paypal-subscription/index.ts (127 lines)
 * - save-paypal-subscription/index.ts (191 lines)
 * - revise-paypal-subscription/index.ts (359 lines)
 */

/**
 * Create PayPal Subscription
 * Extracted from: create-paypal-subscription/index.ts
 * Core business logic: Plan validation + PayPal subscription creation + approval URL
 */
export async function handleCreateSubscription(
  request: PayPalManagementRequest & CreateSubscriptionRequest,
  user: any,
  supabase: any,
  req: Request
): Promise<PayPalResponse> {
  
  console.log('[CREATE-SUBSCRIPTION] Starting subscription creation');
  
  try {
    // ============================================================================
    // INPUT VALIDATION
    // ============================================================================
  const { planId, upgradeFromSubscriptionId } = request;
    
    if (!planId) {
      throw new Error("Plan ID is required");
    }

    if (!user?.email) {
      throw new Error("User email not available for subscription");
    }

    console.log('[CREATE-SUBSCRIPTION] Input validated', { 
      planId, 
      userId: user.id, 
      email: user.email,
      isUpgrade: !!upgradeFromSubscriptionId,
      upgradeFromSubscriptionId: upgradeFromSubscriptionId
    });

    console.log('[CREATE-SUBSCRIPTION] 🚨 DEBUGGING - Request parameters:', {
      operation: request.operation,
      planId: request.planId,
      upgradeFromSubscriptionId: request.upgradeFromSubscriptionId,
      hasUpgradeParam: !!request.upgradeFromSubscriptionId
    });

    // ============================================================================
    // PLAN VALIDATION
    // ============================================================================
    console.log('[CREATE-SUBSCRIPTION] Fetching plan details...');
    
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      throw new Error(`Plan not found: ${planError?.message || 'Unknown error'}`);
    }

    // Determine which PayPal plan ID to use
    let paypalPlanId = plan.paypal_subscription_id;
    
    console.log('[CREATE-SUBSCRIPTION] 🔍 Plan details from database:', {
      planId: plan.id,
      planName: plan.name,
      planNameExact: JSON.stringify(plan.name),
      paypalSubscriptionId: plan.paypal_subscription_id,
      hasUpgradeFromSubscriptionId: !!upgradeFromSubscriptionId,
      upgradeFromSubscriptionId: upgradeFromSubscriptionId
    });
    
    // If this is an upgrade (has upgradeFromSubscriptionId parameter), use the special upgrade plan
    if (upgradeFromSubscriptionId) {
      paypalPlanId = 'P-42C97187S2633854BNBXV6PQ'; // Special upgrade plan ID
      console.log('[CREATE-SUBSCRIPTION] 🔄 UPGRADE DETECTED! Using upgrade plan:', {
        originalPlanId: plan.paypal_subscription_id,
        upgradePlanId: paypalPlanId,
        planName: plan.name,
        upgradeFrom: upgradeFromSubscriptionId
      });
    } else {
      console.log('[CREATE-SUBSCRIPTION] 📝 Regular subscription using plan:', {
        paypalPlanId,
        planName: plan.name,
        hasUpgradeFromSubscriptionId: !!upgradeFromSubscriptionId
      });
    }

    if (!paypalPlanId) {
      throw new Error("Plan does not have a PayPal subscription ID configured");
    }

    console.log('[CREATE-SUBSCRIPTION] Plan validated', {
      planName: plan.name,
      paypalSubId: paypalPlanId,
      isUpgrade: !!upgradeFromSubscriptionId
    });

    // ============================================================================
    // PAYPAL SUBSCRIPTION CREATION
    // ============================================================================
    console.log('[CREATE-SUBSCRIPTION] Getting PayPal access token...');
    const accessToken = await getPayPalAccessToken();

    // Build subscription request data (preserving exact format from working function)
  const subscriptionData = {
      plan_id: paypalPlanId, // Use the determined plan ID (upgrade or regular)
      // Bind provisional subscription to user id (checked during verification & via webhook)
      custom_id: user.id,
      subscriber: {
        email_address: user.email
      },
      application_context: {
        brand_name: "Your App Name",
        locale: "en-US", 
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
        },
    // We add state (nonce) to return URL for CSRF/link hijack mitigation
    return_url: `${req.headers.get("origin")}/paypal-verification`,
        cancel_url: `${req.headers.get("origin")}/subscription?cancelled=true`
      }
    };

    console.log('[CREATE-SUBSCRIPTION] Creating PayPal subscription...', {
      planId: paypalPlanId,
      email: user.email,
      isUpgrade: !!upgradeFromSubscriptionId,
      upgradeFrom: upgradeFromSubscriptionId
    });

    console.log('[CREATE-SUBSCRIPTION] 📡 PayPal API Request Data:', {
      plan_id: paypalPlanId,
      subscriber_email: user.email,
      expected_price: paypalPlanId === 'P-42C97187S2633854BNBXV6PQ' ? '$10.00 (upgrade)' : 'Regular plan price'
    });

    const paypalBaseUrl = "https://api-m.sandbox.paypal.com"; // Use same as paypal-client.ts
    
    const subscriptionResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(subscriptionData)
    });

    if (!subscriptionResponse.ok) {
      const errorData = await subscriptionResponse.text();
      console.error('[CREATE-SUBSCRIPTION] PayPal API error:', errorData);
      throw new Error(`Failed to create PayPal subscription: ${errorData}`);
    }

  const subscription: any = await subscriptionResponse.json();

    // --------------------------------------------------------------------------
    // Generate & persist state nonce (ties user + provisional subscription id)
    // --------------------------------------------------------------------------
    const stateNonce = crypto.randomUUID();
    try {
      const { error: nonceError } = await supabase
        .from('subscription_nonces')
        .insert({
          id: stateNonce,
          user_id: user.id,
          provisional_subscription_id: subscription.id,
          created_at: new Date().toISOString()
        });
      if (nonceError) {
        console.warn('[CREATE-SUBSCRIPTION] Failed to persist state nonce (still proceeding):', nonceError.message);
      }
    } catch (nonceInsertErr) {
      console.warn('[CREATE-SUBSCRIPTION] Exception inserting state nonce (proceeding):', (nonceInsertErr as any)?.message || nonceInsertErr);
    }
    
    console.log('[CREATE-SUBSCRIPTION] PayPal subscription created', {
      subscriptionId: subscription.id,
      status: subscription.status
    });

    // ============================================================================
    // APPROVAL URL EXTRACTION
    // ============================================================================
    const approvalLink = subscription.links?.find((link: any) => link.rel === 'approve')?.href;
    
    if (!approvalLink) {
      throw new Error("No approval link found in PayPal response");
    }

    // Preserve exact URL modification pattern from working function
  // Append subscription_id & state to approval link
  const modifiedApprovalLink = `${approvalLink}&subscription_id=${subscription.id}&state=${stateNonce}`;

    console.log('[CREATE-SUBSCRIPTION] Approval link generated', {
      originalLink: approvalLink,
      modifiedLink: modifiedApprovalLink
    });

    // ============================================================================
    // SUCCESS RESPONSE (matching original function format)
    // ============================================================================
    const response: CreateSubscriptionResponse = {
      subscriptionId: subscription.id,
      approvalUrl: modifiedApprovalLink,
      status: subscription.status || 'APPROVAL_PENDING',
      state: stateNonce
    };

    console.log('[CREATE-SUBSCRIPTION] Subscription creation completed successfully');

    // Return direct response format to match original function
    return {
      success: true,
      data: response
    };

  } catch (error) {
    console.error('[CREATE-SUBSCRIPTION] Error:', error);
    
    return {
      success: false,
      error: error.message || 'Failed to create PayPal subscription'
    };
  }
}

/**
 * Verify PayPal Subscription
 * Extracted from: verify-paypal-subscription/index.ts (261 lines)
 * Core business logic: Subscription verification + email fallback + database updates + credit granting
 */
export async function handleVerifySubscription(
  request: PayPalManagementRequest & VerifySubscriptionRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<PayPalResponse> {
  
  console.log('[VERIFY-SUBSCRIPTION] Starting subscription verification');
  console.log('[VERIFY-SUBSCRIPTION] Environment check:', {
    hasUser: !!user,
    hasSupabase: !!supabase,
    hasSupabaseAdmin: !!supabaseAdmin,
    requestKeys: Object.keys(request || {})
  });
  
  try {
    // ============================================================================
    // INPUT VALIDATION
    // ============================================================================
  const { subscriptionId, token, state } = request;
    
    console.log('[VERIFY-SUBSCRIPTION] Received parameters', { 
      hasSubscriptionId: !!subscriptionId, 
      hasToken: !!token,
      hasState: !!state,
      userId: user.id,
      email: user.email
    });

    // ------------------------------------------------------------------------
    // STATE NONCE REQUIREMENT & VALIDATION
    // Prevents attacker from reusing their own subscription_id in victim's session.
    // If a nonce was generated during creation (row exists for provisional_subscription_id + user),
    // we REQUIRE the matching state parameter here (one-time use).
    // ------------------------------------------------------------------------
    if (subscriptionId) {
      const { data: nonceBySub, error: nonceBySubErr } = await supabase
        .from('subscription_nonces')
        .select('id')
        .eq('provisional_subscription_id', subscriptionId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (nonceBySubErr) {
        console.warn('[VERIFY-SUBSCRIPTION] Nonce (by sub) lookup error:', nonceBySubErr.message);
      }
      if (nonceBySub) {
        if (!state) {
          return { success: false, error: 'Missing verification state' };
        }
        const { data: nonceRow, error: nonceError } = await supabase
          .from('subscription_nonces')
          .select('id, provisional_subscription_id, user_id')
          .eq('id', state)
          .maybeSingle();
        if (nonceError) {
          console.warn('[VERIFY-SUBSCRIPTION] Nonce lookup error (state path):', nonceError.message);
          return { success: false, error: 'Verification state lookup failed' };
        }
        if (!nonceRow || nonceRow.user_id !== user.id || nonceRow.provisional_subscription_id !== subscriptionId) {
          return { success: false, error: 'Invalid verification state' };
        }
        // Consume nonce (single-use)
        await supabase.from('subscription_nonces').delete().eq('id', state);
      }
    }

    if (!subscriptionId && !token) {
      throw new Error("Either subscription ID or PayPal token is required");
    }

    if (!user?.email) {
      throw new Error("User email not available for subscription verification");
    }

    // ============================================================================
    // PAYPAL SUBSCRIPTION RETRIEVAL
    // ============================================================================
    console.log('[VERIFY-SUBSCRIPTION] Getting PayPal access token...');
    
    let accessToken: string;
    try {
      accessToken = await getPayPalAccessToken();
      console.log('[VERIFY-SUBSCRIPTION] PayPal access token obtained successfully');
    } catch (tokenError) {
      console.error('[VERIFY-SUBSCRIPTION] Failed to get PayPal access token:', tokenError);
      throw new Error(`Failed to get PayPal access token: ${tokenError.message}`);
    }

    const paypalBaseUrl = "https://api-m.sandbox.paypal.com";
    let subscription: any;

  if (subscriptionId) {
      // Direct subscription lookup by ID
      console.log('[VERIFY-SUBSCRIPTION] Fetching subscription by ID:', subscriptionId);
      
      const subscriptionResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!subscriptionResponse.ok) {
        const errorData = await subscriptionResponse.text();
        console.error('[VERIFY-SUBSCRIPTION] PayPal subscription fetch failed:', errorData);
        throw new Error(`Failed to get PayPal subscription: ${errorData}`);
      }

      subscription = await subscriptionResponse.json();

      // Ownership binding checks
      try {
        const subEmail = subscription?.subscriber?.email_address?.toLowerCase?.();
        if (!subEmail) {
          throw new Error('Missing subscriber email in PayPal subscription');
        }
        if (subEmail !== user.email.toLowerCase()) {
          throw new Error('Subscription email mismatch');
        }
        if (subscription?.custom_id && subscription.custom_id !== user.id) {
          throw new Error('Subscription ownership mismatch (custom_id)');
        }
      } catch (ownershipErr) {
        console.error('[VERIFY-SUBSCRIPTION] Ownership validation failed:', ownershipErr);
        return { success: false, error: ownershipErr.message || 'Ownership validation failed' };
      }
      
    } else if (token) {
      // Email-based fallback search (preserve original logic)
      console.log('[VERIFY-SUBSCRIPTION] Attempting to find subscription by user email since no subscription ID provided');
      
      const searchResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions?start_time=${new Date(Date.now() - 60 * 60 * 1000).toISOString()}&page_size=10`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (searchResponse.ok) {
  const searchData: any = await searchResponse.json();
  subscription = searchData.subscriptions?.find((sub: any) => 
          sub.subscriber?.email_address?.toLowerCase() === user.email?.toLowerCase() && 
          sub.status === 'ACTIVE'
        );
        
        if (!subscription) {
          throw new Error("Could not find an active subscription for your email address");
        }
      } else {
        throw new Error("Failed to search for subscription");
      }
    }

    console.log('[VERIFY-SUBSCRIPTION] PayPal subscription found & ownership confirmed', {
      subscriptionId: subscription.id,
      status: subscription.status,
      planId: subscription.plan_id,
      custom_id: subscription.custom_id
    });

    // ============================================================================
    // DUPLICATE CHECK
    // ============================================================================
    console.log('[VERIFY-SUBSCRIPTION] Checking if subscription already exists...');
    
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('id, plan_id')
      .eq('paypal_subscription_id', subscription.id)
      .maybeSingle();

    if (existingSubscription) {
      console.log('[VERIFY-SUBSCRIPTION] Subscription already exists, returning success', {
        subscriptionId: existingSubscription.id
      });
      
      return {
        success: true,
        data: {
          message: "Subscription already verified",
          subscription: {
            id: subscription.id,
            status: subscription.status
          }
        }
      };
    }

    // ============================================================================
    // PLAN LOOKUP AND UPGRADE DETECTION
    // ============================================================================
    const paypalPlanId = subscription.plan_id;
    console.log('[VERIFY-SUBSCRIPTION] Looking up plan by PayPal plan ID:', paypalPlanId);
    
    // Check if this is the special upgrade plan
    const isUpgrade = paypalPlanId === 'P-42C97187S2633854BNBXV6PQ';
    let planData: PlanRecord | null;
    
    if (isUpgrade) {
      console.log('[VERIFY-SUBSCRIPTION] This is an upgrade subscription - mapping to The Whale plan');
      
      // For upgrades, map to The Whale plan
      const { data: whalePlan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('name', 'The Whale')
        .single();
        
      if (planError) {
        console.error('[VERIFY-SUBSCRIPTION] Database error when looking up The Whale plan:', planError);
        throw new Error(`Database error when looking up The Whale plan: ${planError.message}`);
      }
      
      if (!whalePlan) {
        throw new Error('The Whale plan not found in database for upgrade');
      }
      
      planData = whalePlan;
      console.log('[VERIFY-SUBSCRIPTION] Upgrade mapped to The Whale plan');
    } else {
      // Normal plan lookup
      const { data: regularPlan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('paypal_subscription_id', paypalPlanId)
        .maybeSingle();

      if (planError) {
        console.error('[VERIFY-SUBSCRIPTION] Database error when looking up plan:', planError);
        throw new Error(`Database error when looking up plan: ${planError.message}`);
      }

      if (!regularPlan) {
        console.error('[VERIFY-SUBSCRIPTION] Plan not found for PayPal plan ID:', paypalPlanId);
        throw new Error(`Plan not found for PayPal plan ID: ${paypalPlanId}. Please contact support.`);
      }
      
      planData = regularPlan;
    }

    console.log('[VERIFY-SUBSCRIPTION] Plan found in database', {
      planName: planData.name,
      planId: planData.id,
      creditsAllowance: planData.monthly_credits_allowance
    });

    // ============================================================================
    // DATABASE UPDATE
    // ============================================================================
    console.log('[VERIFY-SUBSCRIPTION] Upserting subscription into database...');
    
    // Use RPC instead of direct table upsert helper for central logic enforcement
    const { data: upsertedId, error: upsertErr } = await (supabase as any).rpc('upsert_subscription', {
      p_user_id: user.id,
      p_plan_id: planData.id,
      p_paypal_subscription_id: subscription.id,
      p_status: subscription.status,
      p_current_period_end: subscription.billing_info?.next_billing_time || null
    });
    if (upsertErr) {
      console.error('[VERIFY-SUBSCRIPTION] upsert_subscription RPC failed:', upsertErr);
      throw new Error('Failed to persist subscription');
    }
    const newSubscription = { id: upsertedId, status: subscription.status } as any;

    // Grant credits only if status indicates activation (no duplicate grants)
    if (['ACTIVE', 'active'].includes(subscription.status) && planData.monthly_credits_allowance) {
      try {
        const { data: grantedBalance, error: grantErr } = await (supabase as any).rpc('add_user_credits', {
          p_user_id: user.id,
          p_amount: planData.monthly_credits_allowance,
          p_transaction_type: 'subscription_allowance',
          p_reference_id: newSubscription.id,
        });
        if (grantErr) {
          console.warn('[VERIFY-SUBSCRIPTION] Credit grant failed (continuing):', grantErr.message);
        } else {
          console.log('[VERIFY-SUBSCRIPTION] Credits granted via RPC. New balance:', grantedBalance);
        }
      } catch (e:any) {
        console.warn('[VERIFY-SUBSCRIPTION] Exception during credit grant (continuing):', e.message || e);
      }
    }

    return {
      success: true,
      data: {
        subscriptionId: newSubscription.id,
        status: newSubscription.status,
        planId: planData.id,
        approvalUrl: null, // No approval URL in this flow
      }
    };

  } catch (error) {
    console.error('[VERIFY-SUBSCRIPTION] Error:', error);
    
    return {
      success: false,
      error: error.message || 'Failed to verify PayPal subscription'
    };
  }
}

/**
 * Cancel PayPal Subscription
 * Extracted from: cancel-paypal-subscription/index.ts (127 lines)
 * Core business logic: Active subscription check + PayPal cancellation + status update
 */
export async function handleCancelSubscription(
  request: PayPalManagementRequest & CancelSubscriptionRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<PayPalResponse> {
  
  console.log('[CANCEL-SUBSCRIPTION] Starting subscription cancellation');
  
  try {
    // ============================================================================
    // ACTIVE SUBSCRIPTION LOOKUP
    // ============================================================================
    console.log('[CANCEL-SUBSCRIPTION] Looking up active subscription for user:', user.id);
    
    const { data: subscription, error: fetchError } = await supabase
      .from('billing.subscriptions')
      .select('id, plan_id, status, paypal_subscription_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (fetchError || !subscription || !subscription.paypal_subscription_id) {
      throw new Error("No active PayPal subscription found to cancel");
    }

    // Additional safety check - prevent cancellation of free/guest subscriptions
    if (subscription.plan && subscription.plan.price_monthly === 0) {
      throw new Error("Cannot cancel free subscription plans");
    }

    console.log('[CANCEL-SUBSCRIPTION] Active subscription found', {
      subscriptionId: subscription.paypal_subscription_id,
      planName: subscription.plan.name,
      planPrice: subscription.plan.price_monthly
    });

    // ============================================================================
    // PAYPAL CANCELLATION
    // ============================================================================
    console.log('[CANCEL-SUBSCRIPTION] Getting PayPal access token...');
    const accessToken = await getPayPalAccessToken();

    const paypalBaseUrl = "https://api-m.sandbox.paypal.com";
    
    console.log('[CANCEL-SUBSCRIPTION] Cancelling PayPal subscription:', subscription.paypal_subscription_id);

    const cancelResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${subscription.paypal_subscription_id}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        reason: "User requested cancellation"
      })
    });

    if (!cancelResponse.ok) {
      const errorData = await cancelResponse.text();
      console.error('[CANCEL-SUBSCRIPTION] PayPal cancellation failed:', errorData);
      throw new Error(`Failed to cancel PayPal subscription: ${errorData}`);
    }

    console.log('[CANCEL-SUBSCRIPTION] PayPal subscription cancelled successfully');

    // Use RPC to mark subscription canceled (does not auto-downgrade). Then optionally ensure a Guest Pass exists.
    const { data: cancelData, error: cancelErr } = await (supabaseAdmin as any).rpc('cancel_subscription', {
      p_user_id: user.id,
      p_subscription_id: subscription.id,
      p_cancel_immediately: false
    });
    if (cancelErr) {
      console.error('[CANCEL-SUBSCRIPTION] cancel_subscription RPC failed:', cancelErr);
      throw new Error('Failed to mark subscription canceled');
    }

    // Ensure Guest Pass (free) plan subscription if needed by creating new active one via upsert_subscription
    const { data: guestPassPlan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('name', 'Guest Pass')
      .single();
    if (planError || !guestPassPlan) {
      console.warn('[CANCEL-SUBSCRIPTION] Guest Pass plan lookup failed (continuing):', planError?.message);
    } else {
      const { error: guestUpsertErr } = await (supabaseAdmin as any).rpc('upsert_subscription', {
        p_user_id: user.id,
        p_plan_id: guestPassPlan.id,
        p_paypal_subscription_id: null,
        p_status: 'active',
        p_current_period_end: null
      });
      if (guestUpsertErr) {
        console.warn('[CANCEL-SUBSCRIPTION] Guest Pass upsert failed (continuing):', guestUpsertErr.message);
      }
    }

    return {
      success: true,
      data: {
        message: 'Subscription canceled; Guest Pass active',
        subscription: {
          id: subscription.paypal_subscription_id,
          status: 'canceled'
        },
        cancellationDate: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('[CANCEL-SUBSCRIPTION] Error:', error);
    
    return {
      success: false,
      error: error.message || 'Failed to cancel PayPal subscription'
    };
  }
}

/**
 * Revise PayPal Subscription  
 * Extracted from: revise-paypal-subscription/index.ts (360 lines)
 * Core business logic: Plan upgrade/downgrade + PayPal API calls + credit adjustment
 */
export async function handleReviseSubscription(
  request: PayPalManagementRequest & ReviseSubscriptionRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any,
  req?: Request
): Promise<PayPalResponse> {
  
  console.log('[REVISE-SUBSCRIPTION] Starting subscription revision');
  
  try {
    // ============================================================================
    // INPUT VALIDATION
    // ============================================================================
    const { subscriptionId, newPlanId } = request;
    
    if (!subscriptionId || !newPlanId) {
      throw new Error("Missing required fields: subscriptionId and newPlanId");
    }

    console.log('[REVISE-SUBSCRIPTION] Request data:', { subscriptionId, newPlanId });

    // ============================================================================
    // GET PAYPAL ACCESS TOKEN
    // ============================================================================
    const accessToken = await getPayPalAccessToken();
    console.log('[REVISE-SUBSCRIPTION] PayPal access token obtained');

    // ============================================================================
    // FETCH CURRENT SUBSCRIPTION
    // ============================================================================
    const { data: currentSubscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        id,
        plan_id,
        paypal_subscription_id,
        plan:plans (
          id,
          name,
          monthly_credits_allowance
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError) {
      throw new Error(`Failed to fetch subscription: ${subError.message}`);
    }

    if (!currentSubscription) {
      throw new Error("No active subscription found for user");
    }

    console.log('[REVISE-SUBSCRIPTION] Current subscription found:', {
      subscriptionId: currentSubscription.id,
      currentPlanId: currentSubscription.plan_id,
      currentPlanName: currentSubscription.plan?.name
    });

    // ============================================================================
    // FETCH NEW PLAN DETAILS
    // ============================================================================
    const { data: newPlan, error: newPlanError } = await supabaseAdmin
      .from('plans')
      .select('id, name, monthly_credits_allowance, price_monthly')
      .eq('id', newPlanId)
      .single();

    if (newPlanError) {
      throw new Error(`Failed to fetch new plan: ${newPlanError.message}`);
    }

    if (!newPlan) {
      throw new Error(`New plan not found: ${newPlanId}`);
    }

    console.log('[REVISE-SUBSCRIPTION] New plan details:', {
      newPlanName: newPlan.name,
      newCredits: newPlan.monthly_credits_allowance
    });

    // ============================================================================
    // PAYPAL PLAN ID MAPPING
    // ============================================================================
    let paypalPlanId = '';
    if (newPlan.name === 'True Fan') {
      paypalPlanId = 'P-6FV20741XD451732ENBXH6WY';
    } else if (newPlan.name === 'The Whale') {
      paypalPlanId = 'P-70K46447GU478721BNBXH5PA';
    } else {
      throw new Error(`No PayPal plan ID mapping found for plan: ${newPlan.name}. Available mappings: True Fan, The Whale`);
    }

    console.log('[REVISE-SUBSCRIPTION] PayPal plan ID mapped:', paypalPlanId);

    // ============================================================================
    // CALL PAYPAL REVISE API
    // ============================================================================
    const reviseResponse = await fetch(
      `https://api.sandbox.paypal.com/v1/billing/subscriptions/${subscriptionId}/revise`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
          "PayPal-Request-Id": `revise-${subscriptionId}-${Date.now()}`
        },
        body: JSON.stringify({
          plan_id: paypalPlanId,
          quantity: "1",
          shipping_amount: {
            currency_code: "USD",
            value: "0.00"
          },
          subscriber: {
            name: {
              given_name: "Subscriber"
            }
          },
          application_context: {
            brand_name: "AI Character Platform",
            locale: "en-US",
            shipping_preference: "NO_SHIPPING",
            user_action: "SUBSCRIBE_NOW",
            payment_method: {
              payer_selected: "PAYPAL",
              payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
            },
            return_url: `${req?.headers.get("origin") || "https://rclpyipeytqbamiwcuih.supabase.co"}/upgrade-verification`,
            cancel_url: `${req?.headers.get("origin") || "https://rclpyipeytqbamiwcuih.supabase.co"}/subscription?cancelled=true`
          }
        })
      }
    );

    if (!reviseResponse.ok) {
      const errorText = await reviseResponse.text();
      throw new Error(`Failed to revise PayPal subscription: ${reviseResponse.status} - ${errorText}`);
    }

    const paypalRevisionResponse = await reviseResponse.json();
    console.log('[REVISE-SUBSCRIPTION] PayPal revision response received');

    // ============================================================================
    // CHECK FOR APPROVAL REQUIREMENT
    // ============================================================================
  const approvalLink = (paypalRevisionResponse as any).links?.find((link: any) => link.rel === 'approve');
    if (approvalLink) {
      console.log('[REVISE-SUBSCRIPTION] Approval needed:', approvalLink.href);
      return {
        success: true,
        data: {
          requires_approval: true,
          approve_url: approvalLink.href
        }
      };
    }

    // =========================================================================
    // UPDATE DATABASE - PLAN CHANGE (use upsert_subscription RPC)
    // =========================================================================
    const { data: rpcSubId, error: reviseErr } = await (supabaseAdmin as any).rpc('upsert_subscription', {
      p_user_id: user.id,
      p_plan_id: newPlan.id,
      p_paypal_subscription_id: subscriptionId,
      p_status: 'active',
      p_current_period_end: null
    });
    if (reviseErr) {
      throw new Error(`Failed to persist revised subscription: ${reviseErr.message}`);
    }

    // =========================================================================
    // CREDIT ADJUSTMENT (use deduct/add RPCs instead of raw table updates)
    // =========================================================================
    const currentCredits = currentSubscription.plan?.monthly_credits_allowance || 0;
    const newCredits = newPlan.monthly_credits_allowance;
    const creditDifference = newCredits - currentCredits;

    if (creditDifference > 0) {
      try {
        await (supabaseAdmin as any).rpc('add_user_credits', {
          p_user_id: user.id,
            p_amount: creditDifference,
            p_transaction_type: 'subscription_allowance',
            p_reference_id: rpcSubId
        });
      } catch (e:any) {
        console.warn('[REVISE-SUBSCRIPTION] Failed to grant additional credits:', e.message);
      }
    }
    // (If negative difference we intentionally do not claw back past credits)

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    console.log('[REVISE-SUBSCRIPTION] Subscription revised successfully');

    return {
      success: true,
      data: {
        message: "Subscription revised successfully",
        subscription: {
          id: subscriptionId,
          old_plan: currentSubscription.plan?.name,
          new_plan: newPlan.name,
          credit_difference: creditDifference
        }
      }
    };

  } catch (error) {
    console.error('[REVISE-SUBSCRIPTION] Error:', error);
    throw error;
  }
}

/**
 * Save PayPal Subscription
 * Extracted from: save-paypal-subscription/index.ts (192 lines)
 * Core business logic: Subscription verification + database save + credit granting
 */
export async function handleSaveSubscription(
  request: PayPalManagementRequest & SaveSubscriptionRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<PayPalResponse> {
  
  console.log('[SAVE-SUBSCRIPTION] Starting subscription save');
  
  try {
    // ============================================================================
    // INPUT VALIDATION
    // ============================================================================
    const { subscriptionId, planId } = request;
    
    if (!subscriptionId || !planId) {
      throw new Error("Missing required fields: subscriptionId and planId");
    }

    console.log('[SAVE-SUBSCRIPTION] Request data:', { subscriptionId, planId });

    // ============================================================================
    // GET PAYPAL ACCESS TOKEN
    // ============================================================================
    const accessToken = await getPayPalAccessToken();
    console.log('[SAVE-SUBSCRIPTION] PayPal access token obtained');

    // ============================================================================
    // VERIFY SUBSCRIPTION WITH PAYPAL
    // ============================================================================
    const subscriptionResponse = await fetch(
      `https://api.sandbox.paypal.com/v1/billing/subscriptions/${subscriptionId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json"
        }
      }
    );

    if (!subscriptionResponse.ok) {
      throw new Error(`Failed to verify subscription with PayPal: ${subscriptionResponse.status}`);
    }

    const subscriptionData = await subscriptionResponse.json();
    console.log('[SAVE-SUBSCRIPTION] PayPal subscription verified:', {
  status: (subscriptionData as any).status,
  id: (subscriptionData as any).id
    });

    // Check if subscription is active
    if ((subscriptionData as any).status !== "ACTIVE") {
      throw new Error(`Subscription is not active. Status: ${(subscriptionData as any).status}`);
    }

    // ============================================================================
    // FETCH PLAN DETAILS
    // ============================================================================
    const { data: planData, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id, name, monthly_credits_allowance')
      .eq('id', planId)
      .single();

    if (planError) {
      throw new Error(`Failed to fetch plan details: ${planError.message}`);
    }

    if (!planData) {
      throw new Error(`Plan not found: ${planId}`);
    }

    console.log('[SAVE-SUBSCRIPTION] Plan details retrieved:', {
      planName: planData.name,
      credits: planData.monthly_credits_allowance
    });

    // ============================================================================
    // CHECK EXISTING SUBSCRIPTION
    // ============================================================================
    const { data: existingSubscription, error: existingSubError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSubError) {
      throw new Error(`Error checking existing subscription: ${existingSubError.message}`);
    }

    if (existingSubscription) {
      console.log('[SAVE-SUBSCRIPTION] User already has active subscription, updating it');
      
      // Update existing subscription
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          plan_id: planId,
          paypal_subscription_id: subscriptionId,
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', existingSubscription.id);

      if (updateError) {
        throw new Error(`Failed to update subscription: ${updateError.message}`);
      }
    } else {
      // Insert new subscription record
      const { error: insertError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: user.id,
          plan_id: planId,
          paypal_subscription_id: subscriptionId,
          status: 'active',
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });

      if (insertError) {
        throw new Error(`Failed to insert subscription: ${insertError.message}`);
      }

      console.log('[SAVE-SUBSCRIPTION] New subscription created');
    }

    // ============================================================================
    // UPDATE USER CREDITS
    // ============================================================================
    const { data: currentCredits, error: creditsError } = await supabaseAdmin
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (creditsError) {
      throw new Error(`Failed to fetch current credits: ${creditsError.message}`);
    }

    const newBalance = (currentCredits?.balance || 0) + planData.monthly_credits_allowance;
    
    const { error: updateCreditsError } = await supabaseAdmin
      .from('credits')
      .update({ balance: newBalance })
      .eq('user_id', user.id);

    if (updateCreditsError) {
      throw new Error(`Failed to update credits: ${updateCreditsError.message}`);
    }

    console.log('[SAVE-SUBSCRIPTION] Credits updated:', {
      previousBalance: currentCredits?.balance || 0,
      creditsAdded: planData.monthly_credits_allowance,
      newBalance
    });

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    console.log('[SAVE-SUBSCRIPTION] Subscription saved successfully');

    return {
      success: true,
      data: {
        message: "Subscription saved successfully",
        subscription: {
          id: subscriptionId,
          plan: planData.name,
          credits_added: planData.monthly_credits_allowance,
          new_balance: newBalance
        }
      }
    };

  } catch (error) {
    console.error('[SAVE-SUBSCRIPTION] Error:', error);
    throw error;
  }
};

// Removed bare '@supabase/supabase-js' import (not supported in Edge bundling)
// import { User } from '@supabase/supabase-js';
import { PayPalSubscription } from '../types/index.ts';

async function handleSubscriptionCreated(
  subscription: any,
  supabaseAdmin: any,
  user: any,
) {
  const planId = subscription.plan_id;
  if (!planId) {
    console.error('Subscription created without a plan ID:', subscription);
    return;
  }

  const plan = await getPlanById(
    supabaseAdmin,
    planId,
  );
  if (!plan) {
    console.error(`Plan with ID ${planId} not found.`);
    return;
  }

  // Use upsert_subscription RPC
  const { data: rpcId, error: rpcErr } = await (supabaseAdmin as any).rpc('upsert_subscription', {
    p_user_id: user.id,
    p_plan_id: plan.id,
    p_paypal_subscription_id: subscription.id,
    p_status: subscription.status,
    p_current_period_end: subscription.billing_info?.next_billing_time || null
  });
  if (rpcErr) {
    console.error('[WEBHOOK subscription.created] upsert_subscription failed:', rpcErr.message);
    return;
  }

  if (['ACTIVE', 'active'].includes(subscription.status) && plan.monthly_credits_allowance) {
    try {
      await (supabaseAdmin as any).rpc('add_user_credits', {
        p_user_id: user.id,
        p_amount: plan.monthly_credits_allowance,
        p_transaction_type: 'subscription_allowance',
        p_reference_id: rpcId,
      });
    } catch (e:any) {
      console.warn('[WEBHOOK subscription.created] Exception during credit grant:', e.message || e);
    }
  }
}

async function handleSubscriptionCancelled(
  subscription: PayPalSubscription,
  supabaseAdmin: any,
) {
  await updateSubscriptionStatus(
    supabaseAdmin,
    subscription.id,
    'cancelled',
  );
}
