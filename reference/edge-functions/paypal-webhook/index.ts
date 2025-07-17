import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PAYPAL-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify webhook signature (optional but recommended)
    const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);
    
    logStep("Webhook payload received", { 
      eventType: payload.event_type,
      resourceType: payload.resource_type 
    });

    // Handle different webhook events
    switch (payload.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(supabaseClient, payload);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(supabaseClient, payload);
        break;
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionSuspended(supabaseClient, payload);
        break;
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await handlePaymentFailed(supabaseClient, payload);
        break;
      case 'BILLING.SUBSCRIPTION.RENEWED':
        await handleSubscriptionRenewed(supabaseClient, payload);
        break;
      default:
        logStep("Unhandled webhook event", { eventType: payload.event_type });
    }

    return new Response(JSON.stringify({ received: true }), {
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

async function handleSubscriptionActivated(supabaseClient: any, payload: any) {
  const subscriptionId = payload.resource.id;
  logStep("Handling subscription activated", { subscriptionId });
  
  // Update subscription status to active
  const { error } = await supabaseClient
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('paypal_subscription_id', subscriptionId);
    
  if (error) {
    logStep("Error updating subscription status", { error });
  } else {
    logStep("Subscription activated successfully", { subscriptionId });
  }
}

async function handleSubscriptionCancelled(supabaseClient: any, payload: any) {
  const subscriptionId = payload.resource.id;
  logStep("Handling subscription cancelled", { subscriptionId });
  
  // Update subscription status to cancelled
  const { error } = await supabaseClient
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('paypal_subscription_id', subscriptionId);
    
  if (error) {
    logStep("Error updating subscription status", { error });
  } else {
    logStep("Subscription cancelled successfully", { subscriptionId });
  }
}

async function handleSubscriptionSuspended(supabaseClient: any, payload: any) {
  const subscriptionId = payload.resource.id;
  logStep("Handling subscription suspended", { subscriptionId });
  
  // Update subscription status to suspended
  const { error } = await supabaseClient
    .from('subscriptions')
    .update({ status: 'suspended' })
    .eq('paypal_subscription_id', subscriptionId);
    
  if (error) {
    logStep("Error updating subscription status", { error });
  } else {
    logStep("Subscription suspended successfully", { subscriptionId });
  }
}

async function handlePaymentFailed(supabaseClient: any, payload: any) {
  const subscriptionId = payload.resource.billing_agreement_id;
  logStep("Handling payment failed", { subscriptionId });
  
  // Could update subscription status or send notification
  // For now, just log the event
  logStep("Payment failed for subscription", { subscriptionId });
}

async function handleSubscriptionRenewed(supabaseClient: any, payload: any) {
  const subscriptionId = payload.resource.billing_agreement_id;
  logStep("Handling subscription renewed", { subscriptionId });
  
  // Update current period end
  const nextBillingTime = payload.resource.next_billing_time;
  if (nextBillingTime) {
    const { error } = await supabaseClient
      .from('subscriptions')
      .update({ 
        current_period_end: nextBillingTime,
        status: 'active'
      })
      .eq('paypal_subscription_id', subscriptionId);
      
    if (error) {
      logStep("Error updating subscription period", { error });
    } else {
      logStep("Subscription renewed successfully", { subscriptionId, nextBillingTime });
    }
  }
}