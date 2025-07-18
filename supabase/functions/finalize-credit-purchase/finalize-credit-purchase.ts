import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FINALIZE-CREDIT-PURCHASE] ${step}${detailsStr}`);
};

// Credit pack mapping based on price
const getCreditPackByAmount = (amount: number) => {
  if (amount === 10.00) {
    return { packId: 'pack_12k', credits: 12000, name: '12,000 Credits Pack' };
  } else if (amount === 20.00) {
    return { packId: 'pack_24k', credits: 24000, name: '24,000 Credits Pack' };
  }
  return null;
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

    const { orderId } = await req.json();
    if (!orderId) {
      throw new Error("Order ID is required");
    }

    logStep("Processing order", { orderId });

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
    logStep("PayPal order captured successfully", { orderId, captureResult });

    // Extract the captured amount
    const capturedAmount = parseFloat(captureResult.purchase_units[0].payments.captures[0].amount.value);
    logStep("Captured amount", { amount: capturedAmount });

    // Determine credit pack based on captured amount
    const creditPack = getCreditPackByAmount(capturedAmount);
    if (!creditPack) {
      throw new Error(`Invalid captured amount: ${capturedAmount}. Expected $10.00 or $20.00`);
    }

    logStep("Credit pack determined", creditPack);

    // Update the existing purchase record to completed
    const { error: updatePurchaseError } = await supabaseClient
      .from('credit_pack_purchases')
      .update({ 
        status: 'completed',
        credits_granted: creditPack.credits,
        amount_paid: capturedAmount
      })
      .eq('paypal_order_id', orderId)
      .eq('user_id', user.id);

    if (updatePurchaseError) {
      logStep("Failed to update purchase record", { error: updatePurchaseError });
      throw new Error(`Failed to update purchase record: ${updatePurchaseError.message}`);
    }

    logStep("Purchase record updated to completed");

    // Get current user credits
    const { data: currentCredits, error: getCurrentError } = await supabaseClient
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    
    if (getCurrentError) {
      logStep("Failed to get current credits", { error: getCurrentError });
      throw new Error(`Failed to get current credits: ${getCurrentError.message}`);
    }
    
    const newBalance = currentCredits.balance + creditPack.credits;
    logStep("Calculated new balance", { currentBalance: currentCredits.balance, creditsToAdd: creditPack.credits, newBalance });
    
    // Update user's credit balance
    const { error: creditError } = await supabaseClient
      .from('credits')
      .update({ balance: newBalance })
      .eq('user_id', user.id);

    if (creditError) {
      logStep("Credit update failed", { error: creditError });
      throw new Error(`Failed to update credits: ${creditError.message}`);
    }

    logStep("Credits added successfully", { creditsAdded: creditPack.credits, newBalance });

    return new Response(JSON.stringify({ 
      success: true,
      orderId: orderId,
      creditPack: creditPack.name,
      creditsAdded: creditPack.credits,
      newBalance: newBalance,
      amountPaid: capturedAmount
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