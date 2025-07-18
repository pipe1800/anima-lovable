import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Credit amounts
const CREDIT_AMOUNTS = {
  'True Fan': 15000,
  'The Whale': 32000
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[COMPLETE-SUBSCRIPTION-UPGRADE] ${step}${detailsStr}`);
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

    const { subscriptionId, targetPlanId } = await req.json();
    if (!subscriptionId || !targetPlanId) {
      throw new Error("Missing required parameters");
    }

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

    // Update the subscription plan
    const { error: subscriptionUpdateError } = await supabaseClient
      .from('subscriptions')
      .update({ plan_id: targetPlanId })
      .eq('id', subscriptionId);

    if (subscriptionUpdateError) {
      throw new Error(`Failed to update subscription: ${subscriptionUpdateError.message}`);
    }

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

    logStep("Subscription upgrade completed successfully", { 
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