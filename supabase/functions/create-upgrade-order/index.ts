import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const logStep = (step, details)=>{
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-UPGRADE-ORDER] ${step}${detailsStr}`);
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    logStep("Function started");
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }
    logStep("User authenticated", {
      userId: user.id
    });
    // 1. Verify user's current plan is 'True Fan'
    const { data: currentSub, error: subError } = await supabaseClient.from('subscriptions').select('*, plans(*)').eq('user_id', user.id).eq('status', 'active').single();
    if (subError || currentSub?.plans?.name !== 'True Fan') {
      logStep("Eligibility check failed", {
        plan: currentSub?.plans?.name,
        error: subError?.message
      });
      throw new Error("User is not eligible for this upgrade.");
    }
    logStep("User is eligible for upgrade", {
      subscriptionId: currentSub.id
    });
    // 2. Get PayPal API access token
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const paypalBaseUrl = "https://api-m.sandbox.paypal.com";
    if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured.");
    const tokenResponse = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!tokenResponse.ok) throw new Error("Failed to get PayPal access token.");
    const tokenData = await tokenResponse.json();
    logStep("PayPal token obtained");
    // 3. Create a PayPal order for the $10 difference
    const siteUrl = Deno.env.get("SITE_URL");
    if (!siteUrl) {
      throw new Error("SITE_URL environment variable is not set.");
    }
    const returnUrl = new URL('/upgrade-verification', siteUrl);
    const cancelUrl = new URL('/settings?tab=billing', siteUrl);
    const orderData = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: "10.00"
          },
          description: "Upgrade from True Fan to The Whale"
        }
      ],
      application_context: {
        return_url: returnUrl.href,
        cancel_url: cancelUrl.href
      }
    };
    const orderResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });
    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      logStep("PayPal order creation failed", {
        error: errorText
      });
      throw new Error("Failed to create PayPal order.");
    }
    const order = await orderResponse.json();
    const approvalLink = order.links?.find((link)=>link.rel === 'approve')?.href;
    if (!approvalLink) throw new Error("Could not find PayPal approval link.");
    logStep("PayPal order created", {
      orderId: order.id
    });
    // 4. Return the approval link
    return new Response(JSON.stringify({
      approvalUrl: approvalLink
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    logStep("ERROR", {
      message: errorMessage
    });
    return new Response(JSON.stringify({
      error: errorMessage
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
});
