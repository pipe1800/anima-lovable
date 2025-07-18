import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INITIATE-UPGRADE] ${step}${detailsStr}`);
};

// Dedicated upgrade plan ID
const UPGRADE_PLAN_ID = 'P-42C97187S2633854BNBXV6PQ';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Initialize Supabase client for authentication
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    
    logStep("User authenticated", { userId: user.id });

    // Get PayPal access token
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

    // Create new PayPal subscription with user ID in custom_id
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
        custom_id: user.id, // Critical: Pass user ID for webhook identification
        application_context: {
          return_url: `${returnUrl.href}?user_id=${user.id}`,
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
      approvalLink,
      customId: user.id
    });

    return new Response(JSON.stringify({ 
      success: true,
      approvalUrl: approvalLink,
      subscriptionId: newPaypalSubscriptionId,
      message: "Upgrade subscription created successfully. Please approve on PayPal."
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