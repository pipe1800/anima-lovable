import { getPayPalAccessToken } from './paypal-client.ts';
import type { 
  PayPalManagementRequest, 
  PayPalResponse,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  VerifySubscriptionRequest,
  VerifySubscriptionResponse,
  CancelSubscriptionRequest,
  CancelSubscriptionResponse,
  ReviseSubscriptionRequest,
  SaveSubscriptionRequest
} from '../types/index.ts';

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
        // Preserve exact URL patterns from working function
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

    const subscription = await subscriptionResponse.json();
    
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
    const modifiedApprovalLink = `${approvalLink}&subscription_id=${subscription.id}`;

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
      status: subscription.status || 'APPROVAL_PENDING'
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
    const { subscriptionId, token } = request;
    
    console.log('[VERIFY-SUBSCRIPTION] Received parameters', { 
      hasSubscriptionId: !!subscriptionId, 
      hasToken: !!token,
      userId: user.id,
      email: user.email
    });

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
        const searchData = await searchResponse.json();
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

    console.log('[VERIFY-SUBSCRIPTION] PayPal subscription found', {
      subscriptionId: subscription.id,
      status: subscription.status,
      planId: subscription.plan_id
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
    let plan: any;
    
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
      
      plan = whalePlan;
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
      
      plan = regularPlan;
    }

    console.log('[VERIFY-SUBSCRIPTION] Plan found in database', {
      planName: plan.name,
      planId: plan.id,
      creditsAllowance: plan.monthly_credits_allowance
    });

    // ============================================================================
    // EXISTING SUBSCRIPTION CLEANUP (UPGRADE-AWARE)
    // ============================================================================
    console.log('[VERIFY-SUBSCRIPTION] Checking for existing active subscriptions');
    
    const { data: existingActiveSubscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, paypal_subscription_id, plan:plans(name)')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (fetchError) {
      console.error('[VERIFY-SUBSCRIPTION] Error fetching existing subscriptions:', fetchError);
      throw new Error(`Failed to check existing subscriptions: ${fetchError.message}`);
    }

    if (existingActiveSubscriptions && existingActiveSubscriptions.length > 0) {
      console.log('[VERIFY-SUBSCRIPTION] Found existing active subscriptions', {
        count: existingActiveSubscriptions.length,
        isUpgrade: isUpgrade
      });
      
      if (isUpgrade) {
        // For upgrades, cancel the old subscription on PayPal and in our database
        for (const existingSub of existingActiveSubscriptions) {
          if (existingSub.paypal_subscription_id && existingSub.plan?.name === 'True Fan') {
            console.log('[VERIFY-SUBSCRIPTION] Canceling True Fan subscription on PayPal:', existingSub.paypal_subscription_id);
            
            try {
              // Cancel on PayPal
              const accessToken = await getPayPalAccessToken();
              const cancelResponse = await fetch(`https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${existingSub.paypal_subscription_id}/cancel`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({
                  reason: 'User upgraded to higher plan'
                })
              });
              
              if (cancelResponse.ok) {
                console.log('[VERIFY-SUBSCRIPTION] Successfully canceled True Fan subscription on PayPal');
              } else {
                const errorData = await cancelResponse.text();
                console.error('[VERIFY-SUBSCRIPTION] Failed to cancel subscription on PayPal:', errorData);
                // Don't throw error - continue with database update
              }
            } catch (paypalError) {
              console.error('[VERIFY-SUBSCRIPTION] Error canceling subscription on PayPal:', paypalError);
              // Don't throw error - continue with database update
            }
          }
        }
      }
      
      // Deactivate in our database
      const { error: deactivateError } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (deactivateError) {
        console.error('[VERIFY-SUBSCRIPTION] Error deactivating existing subscriptions:', deactivateError);
        throw new Error(`Failed to deactivate existing subscriptions: ${deactivateError.message}`);
      }
      
      console.log('[VERIFY-SUBSCRIPTION] Successfully deactivated existing active subscriptions');
    }

    // ============================================================================
    // CREATE NEW SUBSCRIPTION
    // ============================================================================
    console.log('[VERIFY-SUBSCRIPTION] Creating new subscription record');
    
    // Calculate current period end (preserve original logic)
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const { error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        status: subscription.status === 'ACTIVE' ? 'active' : subscription.status.toLowerCase(),
        paypal_subscription_id: subscription.id,
        current_period_end: currentPeriodEnd.toISOString()
      });

    if (insertError) {
      console.error('[VERIFY-SUBSCRIPTION] Error creating subscription:', insertError);
      throw new Error(`Failed to create subscription: ${insertError.message}`);
    }
    
    console.log('[VERIFY-SUBSCRIPTION] New subscription created successfully');

    // ============================================================================
    // TRACK UPGRADE (IF APPLICABLE)
    // ============================================================================
    if (isUpgrade) {
      console.log('[VERIFY-SUBSCRIPTION] Recording upgrade transaction');
      
      try {
        const { error: upgradeError } = await supabaseAdmin
          .from('subscription_upgrades')
          .insert({
            user_id: user.id,
            from_plan: 'True Fan',
            to_plan: 'The Whale',
            upgrade_paypal_subscription_id: subscription.id,
            credits_granted: 17000, // Only the upgrade bonus, not monthly credits
            status: 'completed',
            created_at: new Date().toISOString()
          });

        if (upgradeError) {
          console.error('[VERIFY-SUBSCRIPTION] Error recording upgrade:', upgradeError);
          // Don't throw error - subscription was created successfully
        } else {
          console.log('[VERIFY-SUBSCRIPTION] Upgrade recorded successfully');
        }
      } catch (upgradeTrackingError) {
        console.error('[VERIFY-SUBSCRIPTION] Error tracking upgrade:', upgradeTrackingError);
        // Don't throw error - subscription was created successfully
      }
    }

    // ============================================================================
    // GRANT CREDITS (WITH UPGRADE BONUS)
    // ============================================================================
    let creditsToGrant = 0;
    
    if (isUpgrade) {
      // For upgrades, only give the 17,000 bonus credits
      // They'll get the full 32,000 monthly credits starting next billing cycle
      creditsToGrant = 17000; // Upgrade bonus only
      console.log('[VERIFY-SUBSCRIPTION] Upgrade: granting bonus credits only', { 
        upgradeBonus: creditsToGrant,
        note: 'Monthly credits (32k) will start next billing cycle'
      });
    } else {
      // For new subscriptions, give the full monthly allowance
      creditsToGrant = plan.monthly_credits_allowance;
      console.log('[VERIFY-SUBSCRIPTION] New subscription: granting monthly credits', { 
        monthlyCredits: creditsToGrant 
      });
    }
    
    console.log('[VERIFY-SUBSCRIPTION] Granting credits to user', {
      creditsToGrant,
      isUpgrade,
      planMonthlyAllowance: plan.monthly_credits_allowance
    });

    // Get current balance first (preserve original logic)
    const { data: currentCredits, error: fetchCreditsError } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    let creditsGranted = 0;

    if (fetchCreditsError) {
      console.error('[VERIFY-SUBSCRIPTION] Error fetching current credits:', fetchCreditsError);
      // Don't throw error here - subscription was created successfully
    } else {
      const newBalance = (currentCredits?.balance || 0) + creditsToGrant;
      
      console.log('[VERIFY-SUBSCRIPTION] Adding credits to existing balance', {
        currentBalance: currentCredits?.balance,
        creditsToAdd: creditsToGrant,
        newBalance
      });

      const { error: creditsError } = await supabase
        .from('credits')
        .update({ balance: newBalance })
        .eq('user_id', user.id);

      if (creditsError) {
        console.error('[VERIFY-SUBSCRIPTION] Error granting credits:', creditsError);
        // Don't throw error here - subscription was created successfully, just log the credit issue
      } else {
        creditsGranted = creditsToGrant;
        console.log('[VERIFY-SUBSCRIPTION] Credits granted successfully', { newBalance });
      }
    }

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    const response: VerifySubscriptionResponse = {
      verified: true,
      subscriptionId: subscription.id,
      planId: plan.id,
      status: subscription.status,
      creditsGranted
    };

    console.log('[VERIFY-SUBSCRIPTION] Subscription verification completed successfully');

    return {
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          plan: {
            name: plan.name,
            id: plan.id
          }
        },
        creditsGranted
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
    
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError || !subscription || !subscription.paypal_subscription_id) {
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

    // ============================================================================
    // GUEST PASS PLAN LOOKUP
    // ============================================================================
    console.log('[CANCEL-SUBSCRIPTION] Looking up Guest Pass plan...');
    
    const { data: guestPassPlan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('name', 'Guest Pass')
      .single();

    if (planError || !guestPassPlan) {
      console.error('[CANCEL-SUBSCRIPTION] Failed to find Guest Pass plan:', planError);
      throw new Error('Guest Pass plan not found in database');
    }

    console.log('[CANCEL-SUBSCRIPTION] Guest Pass plan found:', guestPassPlan.id);

    // ============================================================================
    // DATABASE SUBSCRIPTION UPDATE TO GUEST PASS
    // ============================================================================
    console.log('[CANCEL-SUBSCRIPTION] Converting subscription to Guest Pass');

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({ 
        status: 'active',
        plan_id: guestPassPlan.id,
        paypal_subscription_id: null, // Remove PayPal ID since Guest Pass is free
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year from now
      })
      .eq('id', subscription.id);

    if (updateError) {
      console.error('[CANCEL-SUBSCRIPTION] Database update failed:', updateError);
      throw new Error(`Failed to update subscription to Guest Pass: ${updateError.message}`);
    }

    console.log('[CANCEL-SUBSCRIPTION] Subscription converted to Guest Pass successfully');

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    const response: CancelSubscriptionResponse = {
      cancelled: true,
      subscriptionId: subscription.paypal_subscription_id,
      cancellationDate: new Date().toISOString()
    };

    console.log('[CANCEL-SUBSCRIPTION] Subscription converted to Guest Pass successfully');

    return {
      success: true,
      data: {
        message: "Subscription cancelled and converted to Guest Pass",
        subscription: {
          id: subscription.paypal_subscription_id,
          status: "converted_to_guest_pass",
          newPlan: "Guest Pass"
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
    const approvalLink = paypalRevisionResponse.links?.find((link: any) => link.rel === 'approve');
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

    // ============================================================================
    // UPDATE DATABASE - PLAN CHANGE
    // ============================================================================
    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({ plan_id: newPlanId })
      .eq('id', currentSubscription.id);

    if (updateError) {
      throw new Error(`Failed to update subscription in database: ${updateError.message}`);
    }

    console.log('[REVISE-SUBSCRIPTION] Subscription updated in database');

    // ============================================================================
    // CREDIT ADJUSTMENT
    // ============================================================================
    const currentCredits = currentSubscription.plan?.monthly_credits_allowance || 0;
    const newCredits = newPlan.monthly_credits_allowance;
    const creditDifference = newCredits - currentCredits;

    console.log('[REVISE-SUBSCRIPTION] Credit calculation:', {
      currentCredits,
      newCredits,
      creditDifference
    });

    if (creditDifference !== 0) {
      // Get current user credit balance
      const { data: userCredits, error: creditsError } = await supabaseAdmin
        .from('credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (creditsError) {
        throw new Error(`Failed to fetch user credits: ${creditsError.message}`);
      }

      const currentBalance = userCredits?.balance || 0;
      const newBalance = currentBalance + creditDifference;

      // Update credit balance
      const { error: updateCreditsError } = await supabaseAdmin
        .from('credits')
        .update({ balance: newBalance })
        .eq('user_id', user.id);

      if (updateCreditsError) {
        throw new Error(`Failed to update credits: ${updateCreditsError.message}`);
      }

      console.log('[REVISE-SUBSCRIPTION] Credits updated:', {
        previousBalance: currentBalance,
        creditDifference,
        newBalance
      });
    }

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
      status: subscriptionData.status,
      id: subscriptionData.id
    });

    // Check if subscription is active
    if (subscriptionData.status !== "ACTIVE") {
      throw new Error(`Subscription is not active. Status: ${subscriptionData.status}`);
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
}
