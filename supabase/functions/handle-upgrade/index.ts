import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[HANDLE-UPGRADE] ${step}${detailsStr}`);
};

// Credit amounts for plans
const CREDIT_AMOUNTS = {
  'True Fan': 15000,
  'The Whale': 32000
};

// Dedicated upgrade plan ID
const UPGRADE_PLAN_ID = 'P-42C97187S2633854BNBXV6PQ';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Step 1: Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    
    logStep("User authenticated", { userId: user.id });

    // Step 1: Verify current subscription is 'True Fan'
    const { data: currentSub, error: subError } = await supabaseClient
      .from('subscriptions')
      .select(`
        *,
        plan:plans(*)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subError || !currentSub) {
      throw new Error("No active subscription found");
    }

    if (currentSub.plan.name !== 'True Fan') {
      throw new Error("User is not eligible for upgrade. Must have 'True Fan' subscription.");
    }

    if (!currentSub.paypal_subscription_id) {
      throw new Error("No PayPal subscription ID found for current subscription");
    }

    logStep("Current subscription verified", { 
      planName: currentSub.plan.name,
      subscriptionId: currentSub.id,
      paypalSubId: currentSub.paypal_subscription_id
    });

    // Step 2: Get PayPal access token
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    
    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials not configured");
    }

    const paypalBaseUrl = "https://api-m.sandbox.paypal.com";
    
    const tokenResponse = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to get PayPal access token");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    logStep("PayPal access token obtained");

    // Step 3: Cancel current PayPal subscription
    const cancelResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${currentSub.paypal_subscription_id}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        reason: 'Upgrading to higher tier plan'
      })
    });

    if (!cancelResponse.ok) {
      const errorData = await cancelResponse.text();
      logStep("PayPal subscription cancellation failed", { error: errorData });
      throw new Error(`Failed to cancel current subscription: ${errorData}`);
    }

    logStep("Current PayPal subscription cancelled successfully");

    // Step 4: Create new PayPal subscription using dedicated upgrade plan
    const siteUrl = Deno.env.get("SITE_URL");
    const returnUrl = new URL('/upgrade-verification', siteUrl);
    const cancelUrl = new URL('/settings?tab=billing', siteUrl);

    const createSubResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'PayPal-Request-Id': `upgrade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      },
      body: JSON.stringify({
        plan_id: UPGRADE_PLAN_ID,
        application_context: {
          return_url: `${returnUrl.href}?subscription_id=${currentSub.id}`,
          cancel_url: cancelUrl.href,
          brand_name: "AnimaChat",
          user_action: "SUBSCRIBE_NOW"
        }
      })
    });

    if (!createSubResponse.ok) {
      const errorData = await createSubResponse.text();
      logStep("PayPal subscription creation failed", { error: errorData });
      throw new Error(`Failed to create new subscription: ${errorData}`);
    }

    const newSubscriptionData = await createSubResponse.json();
    const newPaypalSubscriptionId = newSubscriptionData.id;
    const approvalLink = newSubscriptionData.links?.find((link: any) => link.rel === 'approve')?.href;

    if (!approvalLink) {
      throw new Error("Could not get PayPal approval link for new subscription");
    }

    logStep("New PayPal subscription created", { 
      newSubscriptionId: newPaypalSubscriptionId,
      approvalLink 
    });

    // Step 5: Update database with new subscription details
    const { error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({ 
        paypal_subscription_id: newPaypalSubscriptionId,
        status: 'pending_approval'
      })
      .eq('id', currentSub.id);

    if (updateError) {
      logStep("Database update failed", { error: updateError });
      throw new Error(`Failed to update subscription in database: ${updateError.message}`);
    }

    logStep("Database updated with new subscription details");

    // Step 6: Grant credit difference immediately (17,000 credits)
    const currentCredits = CREDIT_AMOUNTS['True Fan'] || 0;
    const targetCredits = CREDIT_AMOUNTS['The Whale'] || 0;
    const creditDifference = targetCredits - currentCredits; // Should be 17,000

    if (creditDifference > 0) {
      const { data: currentCreditsData, error: getCurrentError } = await supabaseClient
        .from('credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      
      if (getCurrentError) {
        logStep("Failed to get current credits", { error: getCurrentError });
        throw new Error(`Failed to get current credits: ${getCurrentError.message}`);
      }
      
      const newBalance = currentCreditsData.balance + creditDifference;
      
      const { error: creditError } = await supabaseClient
        .from('credits')
        .update({ balance: newBalance })
        .eq('user_id', user.id);

      if (creditError) {
        logStep("Credit update failed", { error: creditError });
        throw new Error(`Failed to update credits: ${creditError.message}`);
      }
      
      logStep("Credits updated successfully", { 
        creditsAdded: creditDifference, 
        newBalance 
      });
    }

    // Step 7: Return approval link
    logStep("Upgrade process completed successfully", {
      oldSubscriptionId: currentSub.paypal_subscription_id,
      newSubscriptionId: newPaypalSubscriptionId,
      creditsGranted: creditDifference
    });

    return new Response(JSON.stringify({ 
      success: true,
      approvalUrl: approvalLink,
      creditsGranted: creditDifference,
      message: "Upgrade initiated successfully. Please complete approval on PayPal."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});