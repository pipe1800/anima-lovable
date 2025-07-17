import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PayPal subscription prices
const PAYPAL_PRICES = {
  'True Fan': 14.95,
  'The Whale': 24.95
};

// Credit amounts
const CREDIT_AMOUNTS = {
  'True Fan': 15000,
  'The Whale': 32000
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPGRADE-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { targetPlanId } = await req.json();
    if (!targetPlanId) throw new Error("Target plan ID is required");

    // Get user's current subscription
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

    // Get target plan
    const { data: targetPlan, error: targetPlanError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('id', targetPlanId)
      .single();

    if (targetPlanError || !targetPlan) {
      throw new Error(`Target plan not found: ${targetPlanError?.message}`);
    }

    const currentPlanName = currentSub.plan.name;
    const targetPlanName = targetPlan.name;

    logStep("Plans identified", { 
      current: currentPlanName, 
      target: targetPlanName 
    });

    // Calculate price difference using PayPal prices
    const currentPrice = PAYPAL_PRICES[currentPlanName as keyof typeof PAYPAL_PRICES];
    const targetPrice = PAYPAL_PRICES[targetPlanName as keyof typeof PAYPAL_PRICES];
    
    if (!currentPrice || !targetPrice) {
      throw new Error("Invalid plan for upgrade");
    }

    const priceDifference = targetPrice - currentPrice;
    
    if (priceDifference <= 0) {
      throw new Error("Target plan must be more expensive than current plan");
    }

    logStep("Price difference calculated", { 
      currentPrice, 
      targetPrice, 
      difference: priceDifference 
    });

    // Create PayPal order for the price difference
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    
    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials not configured");
    }

    const paypalBaseUrl = "https://api-m.sandbox.paypal.com";
    
    // Get access token
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
    logStep("PayPal access token obtained");

    // Create order for the price difference
    const orderData = {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD",
          value: priceDifference.toFixed(2)
        },
        description: `Upgrade from ${currentPlanName} to ${targetPlanName}`
      }],
      application_context: {
        return_url: `${req.headers.get("origin")}/upgrade-verification?token={token}&subscription_id=${currentSub.id}&target_plan_id=${targetPlanId}&PayerID={PayerID}`,
        cancel_url: `${req.headers.get("origin")}/subscription?upgrade_cancelled=true`
      }
    };

    const orderResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!orderResponse.ok) {
      const errorData = await orderResponse.text();
      logStep("PayPal order creation failed", { error: errorData });
      throw new Error(`Failed to create PayPal order: ${errorData}`);
    }

    const order = await orderResponse.json();
    logStep("PayPal order created", { orderId: order.id });

    // Find the approval link
    const approvalLink = order.links?.find((link: any) => link.rel === 'approve')?.href;
    
    if (!approvalLink) {
      throw new Error("No approval link found in PayPal response");
    }

    return new Response(JSON.stringify({ 
      orderId: order.id,
      approvalUrl: approvalLink,
      priceDifference: priceDifference.toFixed(2),
      creditDifference: CREDIT_AMOUNTS[targetPlanName as keyof typeof CREDIT_AMOUNTS] - CREDIT_AMOUNTS[currentPlanName as keyof typeof CREDIT_AMOUNTS]
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});