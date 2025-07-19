// supabase/functions/verify-upgrade-completion/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { subscription_id: paypalSubscriptionId } = await req.json();
    if (!paypalSubscriptionId) throw new Error("PayPal Subscription ID is required.");
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) throw new Error("User not authenticated.");
    // 1. Get the target plan ("The Whale") from our DB
    const { data: whalePlan } = await supabaseClient.from('plans').select('*').eq('name', 'The Whale').single();
    if (!whalePlan) throw new Error("Could not find 'The Whale' plan in database.");
    // 2. Get PayPal API access token
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const paypalBaseUrl = "https://api-m.sandbox.paypal.com";
    const tokenResponse = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    // 3. Verify the subscription status with PayPal
    const subDetailsResponse = await fetch(`${paypalBaseUrl}/v1/billing/subscriptions/${paypalSubscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!subDetailsResponse.ok) throw new Error("Could not verify subscription details with PayPal.");
    const paypalSub = await subDetailsResponse.json();
    // 4. Check if the plan on PayPal matches the new plan
    if (paypalSub.plan_id !== whalePlan.paypal_subscription_id || paypalSub.status !== 'ACTIVE') {
      throw new Error("Subscription on PayPal was not upgraded correctly or is not active.");
    }
    // 5. Success! Update our internal database
    await supabaseClient.from('subscriptions').update({
      plan_id: whalePlan.id
    }).eq('paypal_subscription_id', paypalSubscriptionId);
    const creditDifference = 17000;
    const { data: credits } = await supabaseClient.from('credits').select('balance').eq('user_id', user.id).single();
    await supabaseClient.from('credits').update({
      balance: (credits?.balance || 0) + creditDifference
    }).eq('user_id', user.id);
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
});
