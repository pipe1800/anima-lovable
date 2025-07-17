import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Credit amounts
const CREDIT_AMOUNTS = {
  'True Fan': 15000,
  'The Whale': 32000
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-UPGRADE-PAYMENT] ${step}${detailsStr}`);
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
    
    logStep("User authenticated", { userId: user.id });

    const { orderId, subscriptionId, targetPlanId } = await req.json();
    if (!orderId || !subscriptionId || !targetPlanId) {
      throw new Error("Missing required parameters");
    }

    // Get PayPal access token
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    
    logStep("PayPal credentials check", { 
      hasClientId: !!clientId, 
      hasClientSecret: !!clientSecret,
      clientIdLength: clientId?.length || 0,
      clientSecretLength: clientSecret?.length || 0
    });
    
    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials not configured");
    }

    // If PayPal credentials exist, continue with full PayPal integration...
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

    // Capture the PayPal order
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
      throw new Error(`Failed to capture PayPal payment: ${errorData}`);
    }

    const captureData = await captureResponse.json();
    
    if (captureData.status !== 'COMPLETED') {
      throw new Error("Payment capture not completed");
    }

    logStep("PayPal payment captured successfully", { orderId, status: captureData.status });

    // Get current subscription and target plan
    const { data: currentSub, error: subError } = await supabaseClient
      .from('subscriptions')
      .select(`
        *,
        plan:plans(*)
      `)
      .eq('id', subscriptionId)
      .eq('user_id', user.id)
      .single();

    if (subError || !currentSub) {
      throw new Error("Subscription not found");
    }

    const { data: targetPlan, error: targetPlanError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('id', targetPlanId)
      .single();

    if (targetPlanError || !targetPlan) {
      throw new Error("Target plan not found");
    }

    const currentPlanName = currentSub.plan.name;
    const targetPlanName = targetPlan.name;

    // Calculate credit difference
    const currentCredits = CREDIT_AMOUNTS[currentPlanName as keyof typeof CREDIT_AMOUNTS] || 0;
    const targetCredits = CREDIT_AMOUNTS[targetPlanName as keyof typeof CREDIT_AMOUNTS] || 0;
    const creditDifference = targetCredits - currentCredits;

    logStep("Credit difference calculated", { 
      currentCredits, 
      targetCredits, 
      difference: creditDifference 
    });

    // Add credits to user's account
    if (creditDifference > 0) {
      const { data: currentCreditsData, error: getCurrentError } = await supabaseClient
        .from('credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      
      if (getCurrentError) {
        logStep("Failed to get current credits", { error: getCurrentError });
        throw new Error(`Failed to get current credits: ${getCurrentError.message}`);
      }
      
      const newBalance = currentCreditsData.balance + creditDifference;
      logStep("Calculated new balance", { currentBalance: currentCreditsData.balance, newBalance });
      
      const { error: creditError } = await supabaseClient
        .from('credits')
        .update({ balance: newBalance })
        .eq('user_id', user.id);

      if (creditError) {
        logStep("Credit update failed", { error: creditError });
        throw new Error(`Failed to update credits: ${creditError.message}`);
      }
      
      logStep("Credits updated successfully", { newBalance });
    }

    // Revise PayPal subscription if it exists
    let paypalRevisionSuccessful = false;
    
    if (currentSub.paypal_subscription_id && targetPlan.paypal_subscription_id) {
      logStep("Starting PayPal subscription revision", { 
        currentSubscriptionId: currentSub.paypal_subscription_id,
        targetPlanId: targetPlan.paypal_subscription_id
      });

      try {
        const reviseResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${currentSub.paypal_subscription_id}/revise`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'PayPal-Request-Id': `revise-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          },
          body: JSON.stringify({
            plan_id: targetPlan.paypal_subscription_id,
            application_context: {
              return_url: `https://44846289-50c5-405d-bf12-00bc4f98a009.lovableproject.com/upgrade-callback?subscription_id=${subscriptionId}&target_plan_id=${targetPlanId}`,
              cancel_url: `https://44846289-50c5-405d-bf12-00bc4f98a009.lovableproject.com/settings?tab=billing`
            }
          })
        });

        if (reviseResponse.ok) {
          const reviseData = await reviseResponse.json();
          logStep("PayPal subscription revision successful", { reviseData });
          
          // Check if approval is required
          const approvalLink = reviseData.links?.find((link: any) => link.rel === 'approve')?.href;
          
          if (approvalLink) {
            logStep("PayPal subscription revision requires approval", { approvalLink });
            
            return new Response(JSON.stringify({ 
              success: false,
              requiresApproval: true,
              approvalUrl: approvalLink,
              message: "Please approve the subscription change on PayPal",
              subscriptionId,
              targetPlanId,
              creditsToAdd: creditDifference
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          } else {
            paypalRevisionSuccessful = true;
            logStep("PayPal subscription revised successfully without approval");
          }
        } else {
          const errorData = await reviseResponse.text();
          logStep("PayPal subscription revision failed - continuing with database update", { 
            error: errorData, 
            status: reviseResponse.status 
          });
        }
      } catch (error) {
        logStep("PayPal subscription revision error - continuing with database update", { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    } else {
      logStep("Skipping PayPal subscription revision", { 
        hasPaypalSubscriptionId: !!currentSub.paypal_subscription_id,
        hasTargetPlanPaypalId: !!targetPlan.paypal_subscription_id
      });
    }

    // Update the subscription plan in our database (always do this since payment was captured)
    logStep("Updating subscription in database", { subscriptionId, targetPlanId });
    
    const { error: subscriptionUpdateError } = await supabaseClient
      .from('subscriptions')
      .update({ plan_id: targetPlanId })
      .eq('id', subscriptionId);

    if (subscriptionUpdateError) {
      logStep("Database subscription update failed", { error: subscriptionUpdateError });
      throw new Error(`Failed to update subscription in database: ${subscriptionUpdateError.message}`);
    }

    logStep("Upgrade completed successfully", { 
      subscriptionId, 
      newPlan: targetPlanName,
      creditsAdded: creditDifference 
    });

    return new Response(JSON.stringify({ 
      success: true,
      newPlan: targetPlanName,
      creditsAdded: creditDifference
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