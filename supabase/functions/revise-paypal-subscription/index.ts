import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Helper logging function for debugging
const logStep = (step, details)=>{
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REVISE-PAYPAL-SUBSCRIPTION] ${step}${detailsStr}`);
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
    logStep("Environment variables check", {
      hasPaypalClientId: !!paypalClientId,
      hasPaypalClientSecret: !!paypalClientSecret,
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseServiceKey: !!supabaseServiceKey
    });
    if (!paypalClientId || !paypalClientSecret) {
      throw new Error("PayPal credentials not configured");
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }
    logStep("Environment variables verified");
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    logStep("Supabase client created");
    // Get user from authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }
    logStep("Authorization header found");
    const token = authHeader.replace("Bearer ", "");
    logStep("Attempting to authenticate user");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) {
      logStep("User authentication failed", {
        error: userError.message
      });
      throw new Error(`Authentication error: ${userError.message}`);
    }
    const user = userData.user;
    if (!user) {
      logStep("No user found in token");
      throw new Error("User not authenticated");
    }
    logStep("User authenticated", {
      userId: user.id,
      email: user.email
    });
    // Parse request body
    logStep("Parsing request body");
    const body = await req.json();
    const { subscriptionId, newPlanId } = body;
    logStep("Request data received", {
      subscriptionId,
      newPlanId
    });
    if (!subscriptionId || !newPlanId) {
      throw new Error("Missing required fields: subscriptionId and newPlanId");
    }
    // Get PayPal access token
    logStep("Getting PayPal access token");
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
      logStep("PayPal token request failed", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText
      });
      throw new Error(`Failed to get PayPal access token: ${tokenResponse.status}`);
    }
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    logStep("PayPal access token obtained successfully");
    // Get current user subscription to find current plan
    logStep("Fetching current user subscription");
    const { data: currentSubscription, error: subError } = await supabase.from('subscriptions').select(`
        id,
        plan_id,
        paypal_subscription_id,
        plan:plans (
          id,
          name,
          monthly_credits_allowance
        )
      `).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    logStep("Subscription query completed", {
      hasData: !!currentSubscription,
      error: subError?.message
    });
    if (subError) {
      logStep("Subscription query error", {
        error: subError.message
      });
      throw new Error(`Failed to fetch subscription: ${subError.message}`);
    }
    if (!currentSubscription) {
      logStep("No active subscription found for user");
      throw new Error("No active subscription found for user");
    }
    logStep("Current subscription found", {
      subscriptionId: currentSubscription.id,
      currentPlanId: currentSubscription.plan_id,
      currentPlanName: currentSubscription.plan?.name,
      paypalSubscriptionId: currentSubscription.paypal_subscription_id
    });
    // Get new plan details
    logStep("Fetching new plan details", {
      newPlanId
    });
    const { data: newPlan, error: newPlanError } = await supabase.from('plans').select('id, name, monthly_credits_allowance, price_monthly').eq('id', newPlanId).maybeSingle();
    logStep("New plan query completed", {
      hasData: !!newPlan,
      error: newPlanError?.message
    });
    if (newPlanError) {
      logStep("New plan query error", {
        error: newPlanError.message
      });
      throw new Error(`Failed to fetch new plan: ${newPlanError.message}`);
    }
    if (!newPlan) {
      logStep("New plan not found", {
        newPlanId
      });
      throw new Error(`New plan not found: ${newPlanId}`);
    }
    logStep("New plan details retrieved", {
      newPlanName: newPlan.name,
      newCredits: newPlan.monthly_credits_allowance
    });
    // Find the PayPal plan ID for the new plan
    let paypalPlanId = '';
    logStep("Mapping plan name to PayPal plan ID", {
      planName: newPlan.name
    });
    if (newPlan.name === 'True Fan') {
      paypalPlanId = 'P-6FV20741XD451732ENBXH6WY';
    } else if (newPlan.name === 'The Whale') {
      paypalPlanId = 'P-70K46447GU478721BNBXH5PA';
    } else {
      logStep("ERROR: No PayPal plan ID mapping found", {
        planName: newPlan.name
      });
      throw new Error(`No PayPal plan ID mapping found for plan: ${newPlan.name}. Available mappings: True Fan, The Whale`);
    }
    logStep("PayPal plan ID mapped", {
      paypalPlanId
    });
    // Call PayPal's revise subscription API with proper upgrade structure
    logStep("Calling PayPal revise subscription API", {
      subscriptionId,
      paypalPlanId,
      currentPlanName: currentSubscription.plan?.name,
      newPlanName: newPlan.name,
      priceIncrease: newPlan.price_monthly - (currentSubscription.plan?.monthly_credits_allowance || 0)
    });
    const reviseResponse = await fetch(`https://api.sandbox.paypal.com/v1/billing/subscriptions/${subscriptionId}/revise`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "PayPal-Request-Id": `revise-${subscriptionId}-${Date.now()}`
      },
      body: JSON.stringify({
        plan_id: paypalPlanId,
        quantity: "1",
        shipping_amount: {
          currency_code: "USD",
          value: "0.00"
        },
        subscriber: {
          name: {
            given_name: "Subscriber"
          }
        },
        application_context: {
          brand_name: "AI Character Platform",
          locale: "en-US",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          payment_method: {
            payer_selected: "PAYPAL",
            payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
          },
          return_url: `https://rclpyipeytqbamiwcuih.supabase.co/subscription?success=true`,
          cancel_url: `https://rclpyipeytqbamiwcuih.supabase.co/subscription?cancelled=true`
        }
      })
    });
    logStep("PayPal revise response received", {
      status: reviseResponse.status,
      statusText: reviseResponse.statusText,
      ok: reviseResponse.ok
    });
    if (!reviseResponse.ok) {
      const errorText = await reviseResponse.text();
      logStep("PayPal revise failed", {
        status: reviseResponse.status,
        error: errorText
      });
      throw new Error(`Failed to revise PayPal subscription: ${reviseResponse.status} - ${errorText}`);
    }
    // Parse the PayPal API response
    const paypalRevisionResponse = await reviseResponse.json();
    logStep("PayPal revision response parsed", {
      response: paypalRevisionResponse,
      hasLinks: !!paypalRevisionResponse.links,
      linksCount: paypalRevisionResponse.links?.length || 0,
      allLinkRels: paypalRevisionResponse.links?.map((l)=>l.rel) || []
    });
    // Check for an approval link
    const approvalLink = paypalRevisionResponse.links?.find((link)=>link.rel === 'approve');
    if (approvalLink) {
      logStep("Approval needed", {
        url: approvalLink.href
      });
      return new Response(JSON.stringify({
        success: true,
        requires_approval: true,
        approve_url: approvalLink.href
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        },
        status: 200
      });
    }
    logStep("PayPal subscription revised successfully without approval needed");
    // Update our database - change the plan_id
    logStep("Updating subscription in database", {
      subscriptionId: currentSubscription.id,
      newPlanId
    });
    const { error: updateError } = await supabase.from('subscriptions').update({
      plan_id: newPlanId
    }).eq('id', currentSubscription.id);
    if (updateError) {
      logStep("Database update failed", {
        error: updateError.message
      });
      throw new Error(`Failed to update subscription in database: ${updateError.message}`);
    }
    logStep("Subscription updated in database successfully");
    // Calculate credit difference and update user's balance
    const currentCredits = currentSubscription.plan?.monthly_credits_allowance || 0;
    const newCredits = newPlan.monthly_credits_allowance;
    const creditDifference = newCredits - currentCredits;
    logStep("Credit calculation", {
      currentCredits,
      newCredits,
      creditDifference
    });
    if (creditDifference !== 0) {
      logStep("Credit difference detected, updating user balance", {
        creditDifference
      });
      // Get current user credit balance
      logStep("Fetching current user credit balance");
      const { data: userCredits, error: creditsError } = await supabase.from('credits').select('balance').eq('user_id', user.id).maybeSingle();
      logStep("Credits query completed", {
        hasData: !!userCredits,
        currentBalance: userCredits?.balance,
        error: creditsError?.message
      });
      if (creditsError) {
        logStep("Credits query failed", {
          error: creditsError.message
        });
        throw new Error(`Failed to fetch user credits: ${creditsError.message}`);
      }
      const currentBalance = userCredits?.balance || 0;
      const newBalance = currentBalance + creditDifference;
      logStep("Calculating new credit balance", {
        currentBalance,
        creditDifference,
        newBalance
      });
      // Update credit balance
      logStep("Updating credit balance in database");
      const { error: updateCreditsError } = await supabase.from('credits').update({
        balance: newBalance
      }).eq('user_id', user.id);
      if (updateCreditsError) {
        logStep("Credits update failed", {
          error: updateCreditsError.message
        });
        throw new Error(`Failed to update credits: ${updateCreditsError.message}`);
      }
      logStep("Credits updated successfully", {
        previousBalance: currentBalance,
        creditDifference,
        newBalance
      });
    } else {
      logStep("No credit difference, skipping credit update");
    }
    // Return success response
    const responseData = {
      success: true,
      message: "Subscription revised successfully",
      subscription: {
        id: subscriptionId,
        old_plan: currentSubscription.plan?.name,
        new_plan: newPlan.name,
        credit_difference: creditDifference
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
