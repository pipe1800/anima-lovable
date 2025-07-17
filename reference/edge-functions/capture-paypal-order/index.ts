import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CAPTURE-PAYPAL-ORDER] ${step}${detailsStr}`);
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

    const { orderId, creditPackId } = await req.json();
    if (!orderId || !creditPackId) {
      throw new Error("Order ID and credit pack ID are required");
    }

    // Get credit pack details
    const { data: creditPack, error: packError } = await supabaseClient
      .from('credit_packs')
      .select('*')
      .eq('id', creditPackId)
      .single();

    if (packError || !creditPack) {
      throw new Error(`Credit pack not found: ${packError?.message}`);
    }

    logStep("Credit pack found", { packName: creditPack.name, credits: creditPack.credits_granted });

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

    // Capture the order
    const captureResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!captureResponse.ok) {
      const errorData = await captureResponse.text();
      logStep("PayPal capture failed", { error: errorData });
      throw new Error(`Failed to capture PayPal order: ${errorData}`);
    }

    const captureResult = await captureResponse.json();
    logStep("PayPal order captured successfully", { orderId });

    // Record the purchase
    const { data: purchase, error: purchaseError } = await supabaseClient
      .from('credit_pack_purchases')
      .insert([{
        user_id: user.id,
        credit_pack_id: creditPackId,
        paypal_order_id: orderId,
        amount_paid: creditPack.price,
        credits_granted: creditPack.credits_granted,
        status: 'completed'
      }])
      .select()
      .single();

    if (purchaseError) {
      logStep("Failed to record purchase", { error: purchaseError });
      throw new Error(`Failed to record purchase: ${purchaseError.message}`);
    }

    // Add credits to user's account
    const { data: currentCredits, error: getCurrentError } = await supabaseClient
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    
    if (getCurrentError) {
      logStep("Failed to get current credits", { error: getCurrentError });
      throw new Error(`Failed to get current credits: ${getCurrentError.message}`);
    }
    
    const newBalance = currentCredits.balance + creditPack.credits_granted;
    logStep("Calculated new balance", { currentBalance: currentCredits.balance, newBalance });
    
    const { error: creditError } = await supabaseClient
      .from('credits')
      .update({ balance: newBalance })
      .eq('user_id', user.id);

    if (creditError) {
      logStep("Credit update failed", { error: creditError });
      throw new Error(`Failed to update credits: ${creditError.message}`);
    }

    logStep("Credits added successfully", { creditsAdded: creditPack.credits_granted, newBalance });

    return new Response(JSON.stringify({ 
      success: true,
      purchase: purchase,
      creditsAdded: creditPack.credits_granted,
      newBalance: newBalance
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