import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FINALIZE-AND-RESUBSCRIBE] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { subscription_id } = await req.json();
    
    if (!subscription_id) {
      logStep("No subscription_id provided");
      return new Response(
        JSON.stringify({ error: 'subscription_id is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    logStep("Processing subscription finalization", { subscription_id });

    // Get PayPal access token
    const paypalAuth = btoa(`${Deno.env.get('PAYPAL_CLIENT_ID')}:${Deno.env.get('PAYPAL_CLIENT_SECRET')}`);
    
    const tokenResponse = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${paypalAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get PayPal access token');
    }

    const { access_token } = await tokenResponse.json();
    logStep("Got PayPal access token");

    // Get subscription details from PayPal
    const subscriptionResponse = await fetch(`https://api-m.paypal.com/v1/billing/subscriptions/${subscription_id}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      }
    });

    if (!subscriptionResponse.ok) {
      throw new Error('Failed to get subscription details from PayPal');
    }

    const subscriptionData = await subscriptionResponse.json();
    logStep("Got subscription details from PayPal", { status: subscriptionData.status });

    // Update the subscription in our database
    const { data: updatedSubscription, error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({
        paypal_subscription_id: subscription_id,
        status: subscriptionData.status.toLowerCase()
      })
      .eq('paypal_subscription_id', subscription_id)
      .select()
      .single();

    if (updateError) {
      logStep("Error updating subscription", updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update subscription' }),
        { status: 500, headers: corsHeaders }
      );
    }

    logStep("Successfully finalized subscription", { subscription_id });

    return new Response(
      JSON.stringify({ 
        success: true, 
        subscription: updatedSubscription,
        message: 'Subscription finalized successfully'
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    logStep("Error in finalize-and-resubscribe", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});