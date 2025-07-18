import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-PAYPAL-SUBSCRIPTION] ${step}${detailsStr}`);
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

    const { subscriptionId, token: paypalToken } = await req.json();
    logStep("Received parameters", { subscriptionId, paypalToken });
    
    if (!subscriptionId && !paypalToken) {
      throw new Error("Either subscription ID or PayPal token is required");
    }

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

    // Get subscription details from PayPal
    let subscription;
    
    if (subscriptionId) {
      const subscriptionResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!subscriptionResponse.ok) {
        const errorData = await subscriptionResponse.text();
        logStep("PayPal subscription fetch failed", { error: errorData });
        throw new Error(`Failed to get PayPal subscription: ${errorData}`);
      }

      subscription = await subscriptionResponse.json();
    } else if (paypalToken) {
      logStep("Attempting to find subscription by user email since no subscription ID provided");
      
      const searchResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions?start_time=${new Date(Date.now() - 60*60*1000).toISOString()}&page_size=10`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json'
        }
      });
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        subscription = searchData.subscriptions?.find((sub: any) => 
          sub.subscriber?.email_address?.toLowerCase() === user.email?.toLowerCase() && 
          sub.status === 'ACTIVE'
        );
        
        if (!subscription) {
          throw new Error("Could not find an active subscription for your email address");
        }
      } else {
        throw new Error("Failed to search for subscription");
      }
    }
    
    logStep("PayPal subscription found", { 
      subscriptionId: subscription.id, 
      status: subscription.status,
      planId: subscription.plan_id
    });

    // Check if subscription already exists in our database
    const { data: existingSubscription } = await supabaseClient
      .from('subscriptions')
      .select('id, plan_id')
      .eq('paypal_subscription_id', subscription.id)
      .maybeSingle();

    if (existingSubscription) {
      logStep("Subscription already exists, returning success", { subscriptionId: existingSubscription.id });
      return new Response(JSON.stringify({ 
        success: true,
        message: "Subscription already verified",
        subscription: {
          id: subscription.id,
          status: subscription.status
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Find the plan in our database using the PayPal plan ID
    const paypalPlanId = subscription.plan_id;
    logStep("Looking up plan by PayPal plan ID", { paypalPlanId });
    
    const { data: plan, error: planError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('paypal_subscription_id', paypalPlanId)
      .maybeSingle();

    if (planError) {
      logStep("Database error when looking up plan", { error: planError });
      throw new Error(`Database error when looking up plan: ${planError.message}`);
    }

    if (!plan) {
      logStep("Plan not found", { paypalPlanId });
      throw new Error(`Plan not found for PayPal plan ID: ${paypalPlanId}. Please contact support.`);
    }

    logStep("Plan found in database", { planName: plan.name, planId: plan.id });

    // Calculate current period end
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    // SAFEGUARD: Deactivate any existing active subscriptions to prevent multiple active subscriptions
    logStep("Checking for existing active subscriptions");
    const { data: existingActiveSubscriptions, error: fetchError } = await supabaseClient
      .from('subscriptions')
      .select('id, paypal_subscription_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (fetchError) {
      logStep("Error fetching existing subscriptions", { error: fetchError });
      throw new Error(`Failed to check existing subscriptions: ${fetchError.message}`);
    }

    if (existingActiveSubscriptions && existingActiveSubscriptions.length > 0) {
      logStep("Found existing active subscriptions, deactivating them", { count: existingActiveSubscriptions.length });
      
      const { error: deactivateError } = await supabaseClient
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (deactivateError) {
        logStep("Error deactivating existing subscriptions", { error: deactivateError });
        throw new Error(`Failed to deactivate existing subscriptions: ${deactivateError.message}`);
      }
      
      logStep("Successfully deactivated existing active subscriptions");
    }

    // Create new subscription
    logStep("Creating new subscription record");
    const { error: insertError } = await supabaseClient
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        status: subscription.status === 'ACTIVE' ? 'active' : subscription.status.toLowerCase(),
        paypal_subscription_id: subscription.id,
        current_period_end: currentPeriodEnd.toISOString()
      });

    if (insertError) {
      logStep("Error creating subscription", { error: insertError });
      throw new Error(`Failed to create subscription: ${insertError.message}`);
    }
    
    logStep("New subscription created successfully");

    // Grant monthly credits to user (add to existing balance)
    logStep("Granting monthly credits to user", { creditsToGrant: plan.monthly_credits_allowance });
    
    // First get current balance
    const { data: currentCredits, error: fetchCreditsError } = await supabaseClient
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    
    if (fetchCreditsError) {
      logStep("Error fetching current credits", { error: fetchCreditsError });
      // Don't throw error here - subscription was created successfully
      console.error('Failed to fetch current credits:', fetchCreditsError);
    } else {
      const newBalance = (currentCredits?.balance || 0) + plan.monthly_credits_allowance;
      logStep("Adding credits to existing balance", { 
        currentBalance: currentCredits?.balance, 
        creditsToAdd: plan.monthly_credits_allowance,
        newBalance 
      });
      
      const { error: creditsError } = await supabaseClient
        .from('credits')
        .update({ 
          balance: newBalance 
        })
        .eq('user_id', user.id);

      if (creditsError) {
        logStep("Error granting credits", { error: creditsError });
        // Don't throw error here - subscription was created successfully, just log the credit issue
        console.error('Failed to grant credits:', creditsError);
      } else {
        logStep("Credits granted successfully", { newBalance });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        plan: {
          name: plan.name,
          id: plan.id
        }
      }
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