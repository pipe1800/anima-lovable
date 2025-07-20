import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const logStep = (step, details)=>{
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FINALIZE-AND-RESUBSCRIBE] ${step}${detailsStr}`);
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    logStep("Function started");
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { subscription_id, user_id } = await req.json();
    if (!subscription_id) {
      logStep("No subscription_id provided");
      return new Response(JSON.stringify({
        error: 'subscription_id is required'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    if (!user_id) {
      logStep("No user_id provided");
      return new Response(JSON.stringify({
        error: 'user_id is required'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    logStep("Processing subscription finalization", {
      subscription_id,
      user_id
    });
    // Get PayPal access token
    const paypalBaseUrl = "https://api-m.sandbox.paypal.com"; // Use sandbox to match other functions
    const paypalAuth = btoa(`${Deno.env.get('PAYPAL_CLIENT_ID')}:${Deno.env.get('PAYPAL_CLIENT_SECRET')}`);
    const tokenResponse = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${paypalAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logStep("PayPal token request failed", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText
      });
      throw new Error(`Failed to get PayPal access token: ${tokenResponse.status} ${errorText}`);
    }
    const { access_token } = await tokenResponse.json();
    logStep("Got PayPal access token", { success: true });
    // Get subscription details from PayPal
    const subscriptionResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${subscription_id}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!subscriptionResponse.ok) {
      const errorText = await subscriptionResponse.text();
      logStep("PayPal subscription request failed", {
        subscription_id,
        status: subscriptionResponse.status,
        statusText: subscriptionResponse.statusText,
        error: errorText
      });
      throw new Error(`Failed to get subscription details from PayPal: ${subscriptionResponse.status} ${errorText}`);
    }
    const subscriptionData = await subscriptionResponse.json();
    logStep("Got subscription details from PayPal", {
      status: subscriptionData.status,
      plan_id: subscriptionData.plan_id,
      full_data: subscriptionData
    });

    // First, check if we already have a subscription with this PayPal subscription ID
    const { data: existingWhale, error: whaleError } = await supabaseClient
      .from('subscriptions')
      .select(`
        id,
        user_id,
        plan_id,
        paypal_subscription_id,
        status,
        plan:plans(id, name, monthly_credits_allowance)
      `)
      .eq('user_id', user_id)
      .eq('paypal_subscription_id', subscription_id)
      .single();

    logStep("Checked for existing subscription with PayPal ID", {
      subscription_id,
      user_id,
      existingWhale,
      whaleError
    });

    if (!whaleError && existingWhale) {
      logStep("Subscription already exists with this PayPal ID - upgrade already completed", {
        subscriptionId: existingWhale.id,
        planName: existingWhale.plan?.name
      });
      
      return new Response(JSON.stringify({
        success: true,
        subscription: existingWhale,
        message: 'Upgrade already completed successfully'
      }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // Now get the user's current subscription to upgrade
    const { data: currentSub, error: subError } = await supabaseClient
      .from('subscriptions')
      .select(`
        id,
        user_id,
        plan_id,
        status,
        plan:plans(id, name, monthly_credits_allowance)
      `)
      .eq('user_id', user_id)
      .eq('status', 'active')
      .single();

    if (subError || !currentSub) {
      logStep("No active subscription found to upgrade", { 
        subError: subError,
        currentSub: currentSub,
        user_id: user_id
      });
      throw new Error('Could not find current active subscription to upgrade');
    }

    const { data: whalePlan, error: planError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('name', 'The Whale')
      .single();

    if (planError || !whalePlan) {
      logStep("Error fetching Whale plan", planError);
      throw new Error('Could not find The Whale plan');
    }

    logStep("Current subscription and target plan found", {
      currentPlan: currentSub.plan?.name,
      targetPlan: whalePlan.name,
      userId: currentSub.user_id
    });

    // Calculate credit difference
    const currentCredits = currentSub.plan?.monthly_credits_allowance || 0;
    const newCredits = whalePlan.monthly_credits_allowance;
    const creditDifference = newCredits - currentCredits;

    logStep("Credit calculation", {
      currentCredits,
      newCredits,
      creditDifference
    });

    // Update the subscription to The Whale plan and set the new PayPal subscription ID
    const { data: updatedSubscription, error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({
        plan_id: whalePlan.id,
        paypal_subscription_id: subscription_id,
        status: subscriptionData.status.toLowerCase()
      })
      .eq('id', currentSub.id)
      .select()
      .single();

    if (updateError) {
      logStep("Error updating subscription", updateError);
      throw new Error(`Failed to update subscription: ${updateError.message}`);
    }

    logStep("Subscription updated successfully", {
      subscriptionId: updatedSubscription.id,
      newPlanId: whalePlan.id
    });

    // Add the credit difference to user's account if positive
    if (creditDifference > 0) {
      const { data: currentCreditsData, error: getCurrentError } = await supabaseClient
        .from('credits')
        .select('balance')
        .eq('user_id', currentSub.user_id)
        .single();

      if (getCurrentError) {
        logStep("Failed to get current credits", { error: getCurrentError });
      } else {
        const newBalance = currentCreditsData.balance + creditDifference;
        logStep("Updating user credits", { 
          currentBalance: currentCreditsData.balance, 
          creditDifference,
          newBalance 
        });

        const { error: creditError } = await supabaseClient
          .from('credits')
          .update({ balance: newBalance })
          .eq('user_id', currentSub.user_id);

        if (creditError) {
          logStep("Error updating credits", { error: creditError });
        } else {
          logStep("Credits updated successfully", { newBalance });
        }
      }
    }
    logStep("Successfully finalized subscription", {
      subscription_id
    });
    return new Response(JSON.stringify({
      success: true,
      subscription: updatedSubscription,
      message: 'Subscription finalized successfully'
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    logStep("Error in finalize-and-resubscribe", error.message);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
