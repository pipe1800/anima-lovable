import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REVISE-PAYPAL-SUBSCRIPTION] ${step}${detailsStr}`);
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

    const { subscriptionId, newPlanId } = await req.json();
    if (!subscriptionId || !newPlanId) {
      throw new Error("Missing required parameters");
    }

    // Get current subscription and new plan details
    const { data: currentSub, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('paypal_subscription_id', subscriptionId)
      .eq('user_id', user.id)
      .single();

    if (subError || !currentSub) {
      throw new Error("Subscription not found");
    }

    const { data: newPlan, error: planError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('id', newPlanId)
      .single();

    if (planError || !newPlan) {
      throw new Error("New plan not found");
    }

    logStep("Retrieved subscription and plan details", { 
      currentPlan: currentSub.plan.name,
      newPlan: newPlan.name 
    });

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

    // Revise the subscription plan
    const revisionData = {
      plan_id: newPlan.paypal_subscription_id
    };

    const revisionResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${subscriptionId}/revise`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(revisionData)
    });

    if (!revisionResponse.ok) {
      const errorData = await revisionResponse.text();
      logStep("PayPal revision failed", { error: errorData });
      throw new Error(`Failed to revise PayPal subscription: ${errorData}`);
    }

    const revisionResult = await revisionResponse.json();
    logStep("PayPal subscription revised successfully");

    // Update subscription in database
    const { error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({ plan_id: newPlanId })
      .eq('id', currentSub.id);

    if (updateError) {
      logStep("Database update failed", { error: updateError.message });
      throw new Error(`Failed to update subscription: ${updateError.message}`);
    }

    logStep("Database updated successfully");

    return new Response(JSON.stringify({ 
      success: true,
      message: "Subscription plan revised successfully",
      approvalUrl: revisionResult.links?.find((link: any) => link.rel === 'approve')?.href
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