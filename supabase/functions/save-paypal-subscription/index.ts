import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Helper logging function for debugging
const logStep = (step, details)=>{
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SAVE-PAYPAL-SUBSCRIPTION] ${step}${detailsStr}`);
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    logStep("Function started");
    // Verify required environment variables
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!paypalClientId || !paypalClientSecret) {
      throw new Error("PayPal credentials not configured");
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }
    logStep("Environment variables verified");
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get user from authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", {
      userId: user.id,
      email: user.email
    });
    // Parse request body
    const body = await req.json();
    const { subscriptionId, planId, paypalSubscriptionDetails } = body;
    if (!subscriptionId || !planId) {
      throw new Error("Missing required fields: subscriptionId and planId");
    }
    logStep("Request data received", {
      subscriptionId,
      planId
    });
    // Get PayPal access token
    const tokenResponse = await fetch("https://api.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Language": "en_US",
        "Authorization": `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get PayPal access token: ${tokenResponse.status}`);
    }
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    logStep("PayPal access token obtained");
    // Verify subscription with PayPal
    const subscriptionResponse = await fetch(`https://api.sandbox.paypal.com/v1/billing/subscriptions/${subscriptionId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });
    if (!subscriptionResponse.ok) {
      throw new Error(`Failed to verify subscription with PayPal: ${subscriptionResponse.status}`);
    }
    const subscriptionData = await subscriptionResponse.json();
    logStep("PayPal subscription verified", {
      status: subscriptionData.status,
      id: subscriptionData.id
    });
    // Check if subscription is active
    if (subscriptionData.status !== "ACTIVE") {
      throw new Error(`Subscription is not active. Status: ${subscriptionData.status}`);
    }
    // Look up plan details from our database
    const { data: planData, error: planError } = await supabase.from('plans').select('id, name, monthly_credits_allowance').eq('id', planId).single();
    if (planError) {
      throw new Error(`Failed to fetch plan details: ${planError.message}`);
    }
    if (!planData) {
      throw new Error(`Plan not found: ${planId}`);
    }
    logStep("Plan details retrieved", {
      planName: planData.name,
      credits: planData.monthly_credits_allowance
    });
    // Check if user already has an active subscription
    const { data: existingSubscription, error: existingSubError } = await supabase.from('subscriptions').select('id').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (existingSubError) {
      throw new Error(`Error checking existing subscription: ${existingSubError.message}`);
    }
    if (existingSubscription) {
      logStep("User already has active subscription, updating it");
      // Update existing subscription
      const { error: updateError } = await supabase.from('subscriptions').update({
        plan_id: planId,
        paypal_subscription_id: subscriptionId,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }).eq('id', existingSubscription.id);
      if (updateError) {
        throw new Error(`Failed to update subscription: ${updateError.message}`);
      }
    } else {
      // Insert new subscription record
      const { error: insertError } = await supabase.from('subscriptions').insert({
        user_id: user.id,
        plan_id: planId,
        paypal_subscription_id: subscriptionId,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      if (insertError) {
        throw new Error(`Failed to insert subscription: ${insertError.message}`);
      }
      logStep("New subscription created");
    }
    // Update user's credit balance
    const { data: currentCredits, error: creditsError } = await supabase.from('credits').select('balance').eq('user_id', user.id).single();
    if (creditsError) {
      throw new Error(`Failed to fetch current credits: ${creditsError.message}`);
    }
    const newBalance = (currentCredits?.balance || 0) + planData.monthly_credits_allowance;
    const { error: updateCreditsError } = await supabase.from('credits').update({
      balance: newBalance
    }).eq('user_id', user.id);
    if (updateCreditsError) {
      throw new Error(`Failed to update credits: ${updateCreditsError.message}`);
    }
    logStep("Credits updated", {
      previousBalance: currentCredits?.balance || 0,
      creditsAdded: planData.monthly_credits_allowance,
      newBalance
    });
    // Return success response
    const responseData = {
      success: true,
      message: "Subscription saved successfully",
      subscription: {
        id: subscriptionId,
        plan: planData.name,
        credits_added: planData.monthly_credits_allowance,
        new_balance: newBalance
      }
    };
    logStep("Function completed successfully", responseData);
    return new Response(JSON.stringify(responseData), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", {
      message: errorMessage
    });
    return new Response(JSON.stringify({
      success: false,
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
