import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PAYPAL-WEBHOOK] ${step}${detailsStr}`);
};

// Credit amounts for plans
const CREDIT_AMOUNTS = {
  'True Fan': 15000,
  'The Whale': 32000
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    // Get the raw body and headers for verification
    const rawBody = await req.text();
    const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
    
    if (!webhookId) {
      throw new Error("PAYPAL_WEBHOOK_ID not configured");
    }

    // Parse the webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(rawBody);
    } catch (e) {
      throw new Error("Invalid JSON payload");
    }

    logStep("Webhook data parsed", { 
      eventType: webhookData.event_type,
      resourceType: webhookData.resource?.id 
    });

    // Verify this is a PayPal webhook (basic verification)
    const paypalHeaders = {
      'PAYPAL-AUTH-ALGO': req.headers.get('PAYPAL-AUTH-ALGO'),
      'PAYPAL-TRANSMISSION-ID': req.headers.get('PAYPAL-TRANSMISSION-ID'),
      'PAYPAL-CERT-ID': req.headers.get('PAYPAL-CERT-ID'),
      'PAYPAL-TRANSMISSION-SIG': req.headers.get('PAYPAL-TRANSMISSION-SIG'),
      'PAYPAL-TRANSMISSION-TIME': req.headers.get('PAYPAL-TRANSMISSION-TIME')
    };

    logStep("PayPal headers received", paypalHeaders);

    // For now, we'll do basic verification. In production, you'd want full signature verification.
    if (!paypalHeaders['PAYPAL-TRANSMISSION-ID']) {
      throw new Error("Missing PayPal headers - not a valid webhook");
    }

    // Check if this is a subscription activation event
    if (webhookData.event_type !== 'BILLING.SUBSCRIPTION.ACTIVATED') {
      logStep("Ignoring non-activation event", { eventType: webhookData.event_type });
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Extract user ID and new subscription ID from the webhook
    const customId = webhookData.resource?.custom_id;
    const newPaypalSubscriptionId = webhookData.resource?.id;

    if (!customId || !newPaypalSubscriptionId) {
      throw new Error("Missing custom_id or subscription ID in webhook data");
    }

    logStep("Processing subscription activation", { 
      userId: customId, 
      newSubscriptionId: newPaypalSubscriptionId 
    });

    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Find the user's current subscription
    const { data: currentSub, error: subError } = await supabaseClient
      .from('subscriptions')
      .select(`
        *,
        plan:plans(*)
      `)
      .eq('user_id', customId)
      .eq('status', 'active')
      .single();

    if (subError || !currentSub) {
      logStep("No active subscription found for user", { userId: customId, error: subError });
      // This might be a new subscription, not an upgrade
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    logStep("Found current subscription", { 
      subscriptionId: currentSub.id,
      planName: currentSub.plan.name,
      oldPaypalId: currentSub.paypal_subscription_id
    });

    // Only process if this is an upgrade from True Fan
    if (currentSub.plan.name !== 'True Fan') {
      logStep("Not a True Fan upgrade, ignoring", { currentPlan: currentSub.plan.name });
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Get PayPal access token for API calls
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

    // Cancel the old subscription if it exists
    if (currentSub.paypal_subscription_id && currentSub.paypal_subscription_id !== newPaypalSubscriptionId) {
      logStep("Cancelling old subscription", { oldSubscriptionId: currentSub.paypal_subscription_id });
      
      const cancelResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${currentSub.paypal_subscription_id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          reason: 'User upgraded to higher tier plan'
        })
      });

      if (cancelResponse.ok) {
        logStep("Old subscription cancelled successfully");
      } else {
        const errorData = await cancelResponse.text();
        logStep("Failed to cancel old subscription", { error: errorData });
        // Continue anyway - the new subscription is active
      }
    }

    // Get The Whale plan details
    const { data: whalePlan, error: planError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('name', 'The Whale')
      .single();

    if (planError || !whalePlan) {
      throw new Error("Could not find The Whale plan");
    }

    logStep("Found The Whale plan", { planId: whalePlan.id });

    // Grant credit difference (17,000 credits)
    const creditDifference = CREDIT_AMOUNTS['The Whale'] - CREDIT_AMOUNTS['True Fan']; // 17,000

    const { data: currentCreditsData, error: getCurrentError } = await supabaseClient
      .from('credits')
      .select('balance')
      .eq('user_id', customId)
      .single();
    
    if (getCurrentError) {
      logStep("Failed to get current credits", { error: getCurrentError });
      throw new Error(`Failed to get current credits: ${getCurrentError.message}`);
    }
    
    const newBalance = currentCreditsData.balance + creditDifference;
    
    const { error: creditError } = await supabaseClient
      .from('credits')
      .update({ balance: newBalance })
      .eq('user_id', customId);

    if (creditError) {
      logStep("Credit update failed", { error: creditError });
      throw new Error(`Failed to update credits: ${creditError.message}`);
    }
    
    logStep("Credits updated successfully", { 
      creditsAdded: creditDifference, 
      newBalance 
    });

    // Update the subscription with new plan and PayPal subscription ID
    const { error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({ 
        plan_id: whalePlan.id,
        paypal_subscription_id: newPaypalSubscriptionId,
        status: 'active'
      })
      .eq('id', currentSub.id);

    if (updateError) {
      logStep("Subscription update failed", { error: updateError });
      throw new Error(`Failed to update subscription: ${updateError.message}`);
    }

    logStep("Subscription updated successfully", {
      subscriptionId: currentSub.id,
      newPlanId: whalePlan.id,
      newPaypalId: newPaypalSubscriptionId
    });

    logStep("Upgrade webhook processed successfully", {
      userId: customId,
      oldPlan: 'True Fan',
      newPlan: 'The Whale',
      creditsGranted: creditDifference
    });

    // Return success to PayPal
    return new Response('OK', { 
      status: 200, 
      headers: corsHeaders 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR processing webhook", { message: errorMessage });
    
    // Return 200 to PayPal to avoid retries for application errors
    // Only return 4xx/5xx for actual webhook issues
    return new Response('OK', { 
      status: 200, 
      headers: corsHeaders 
    });
  }
});