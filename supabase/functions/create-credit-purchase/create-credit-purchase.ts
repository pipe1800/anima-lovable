import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CREDIT-PURCHASE] ${step}${detailsStr}`);
};

// Credit pack configurations
const CREDIT_PACKS = {
  'pack_12k': {
    name: '12,000 Credits Pack',
    credits: 12000,
    price: 10.00
  },
  'pack_24k': {
    name: '24,000 Credits Pack', 
    credits: 24000,
    price: 20.00
  }
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

    // Verify user has an active subscription
    const { data: subscription, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      throw new Error("User must have an active subscription to purchase credit packs");
    }

    logStep("User subscription verified", { subscriptionId: subscription.id });

    const { packId } = await req.json();
    if (!packId) throw new Error("Pack ID is required");

    // Validate pack ID and get pack details
    const creditPack = CREDIT_PACKS[packId as keyof typeof CREDIT_PACKS];
    if (!creditPack) {
      throw new Error(`Invalid pack ID. Available packs: ${Object.keys(CREDIT_PACKS).join(', ')}`);
    }

    logStep("Credit pack selected", { packId, packDetails: creditPack });

    // Get PayPal access token
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    
    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials not configured");
    }

    const paypalBaseUrl = "https://api-m.sandbox.paypal.com"; // Sandbox URL
    
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

    // Create order
    const orderData = {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD",
          value: creditPack.price.toString()
        },
        description: `${creditPack.name} - ${creditPack.credits.toLocaleString()} credits`
      }],
      application_context: {
        brand_name: "Your App Name",
        locale: "en-US",
        landing_page: "BILLING",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: `${req.headers.get("origin")}/credit-purchase-verification?pack_id=${packId}`,
        cancel_url: `${req.headers.get("origin")}/subscription?cancelled=true`
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

    // Store the pending purchase in the database
    const { error: purchaseError } = await supabaseClient
      .from('credit_pack_purchases')
      .insert({
        user_id: user.id,
        credit_pack_id: packId, // Using packId as the identifier
        paypal_order_id: order.id,
        amount_paid: creditPack.price,
        credits_granted: creditPack.credits,
        status: 'pending'
      });

    if (purchaseError) {
      logStep("Failed to store purchase record", { error: purchaseError });
      // Don't throw error here - PayPal order is already created
    } else {
      logStep("Purchase record stored", { orderId: order.id });
    }

    // Find the approval link
    const approvalLink = order.links?.find((link: any) => link.rel === 'approve')?.href;
    
    if (!approvalLink) {
      throw new Error("No approval link found in PayPal response");
    }

    logStep("Approval link found", { approvalLink });

    return new Response(JSON.stringify({ 
      orderId: order.id,
      approvalUrl: approvalLink,
      packDetails: creditPack
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