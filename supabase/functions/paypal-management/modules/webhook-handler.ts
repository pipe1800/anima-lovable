import { getPayPalAccessToken } from './paypal-client.ts';

// Global Deno declaration
declare const Deno: any;
import type { 
  PayPalManagementRequest, 
  PayPalResponse,
  WebhookRequest
} from '../types/index.ts';

/**
 * Webhook Operations Handler
 * 
 * Extracted from existing working function:
 * - paypal-webhook/index.ts (236 lines)
 */

// Credit amounts for plans
const CREDIT_AMOUNTS = {
  'True Fan': 15000,
  'The Whale': 32000
};

/**
 * Handle PayPal Webhook
 * Extracted from: paypal-webhook/index.ts
 * Core business logic: Webhook verification + subscription upgrade processing + credit granting
 */
export async function handleWebhook(
  request: PayPalManagementRequest & WebhookRequest,
  supabaseAdmin: any,
  req: Request,
  rawBody: string
): Promise<PayPalResponse> {
  
  console.log('[WEBHOOK] Starting webhook processing');
  
  try {
    // ============================================================================
    // WEBHOOK VERIFICATION
    // ============================================================================
    const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
    if (!webhookId) {
      throw new Error("PAYPAL_WEBHOOK_ID not configured");
    }

    // Parse the webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(rawBody);
    } catch (e) {
      throw new Error("Invalid JSON payload");
    }

    console.log('[WEBHOOK] Webhook data parsed:', {
      eventType: webhookData.event_type,
      resourceType: webhookData.resource?.id
    });

    // Verify this is a PayPal webhook (basic verification)
    const paypalHeaders = {
      'PAYPAL-AUTH-ALGO': req.headers.get('PAYPAL-AUTH-ALGO'),
      'PAYPAL-TRANSMISSION-ID': req.headers.get('PAYPAL-TRANSMISSION-ID'),
      'PAYPAL-CERT-ID': req.headers.get('PAYPAL-CERT-ID'),
      'PAYPAL-TRANSMISSION-SIG': req.headers.get('PAYPAL-TRANSMISSION-SIG'),
      'PAYPAL-TRANSMISSION-TIME': req.headers.get('PAYPAL-TRANSMISSION-TIME')
    };

    console.log('[WEBHOOK] PayPal headers received:', paypalHeaders);

    // For now, we'll do basic verification. In production, you'd want full signature verification.
    if (!paypalHeaders['PAYPAL-TRANSMISSION-ID']) {
      throw new Error("Missing PayPal headers - not a valid webhook");
    }

    // ============================================================================
    // EVENT TYPE FILTERING
    // ============================================================================
    // Check if this is a subscription activation event
    if (webhookData.event_type !== 'BILLING.SUBSCRIPTION.ACTIVATED') {
      console.log('[WEBHOOK] Ignoring non-activation event:', webhookData.event_type);
      return {
        success: true,
        data: { message: `Ignored event type: ${webhookData.event_type}` }
      };
    }

    // ============================================================================
    // EXTRACT WEBHOOK DATA
    // ============================================================================
    const customId = webhookData.resource?.custom_id;
    const newPaypalSubscriptionId = webhookData.resource?.id;
    
    if (!customId || !newPaypalSubscriptionId) {
      throw new Error("Missing custom_id or subscription ID in webhook data");
    }

    console.log('[WEBHOOK] Processing subscription activation:', {
      userId: customId,
      newSubscriptionId: newPaypalSubscriptionId
    });

    // ============================================================================
    // FIND CURRENT SUBSCRIPTION
    // ============================================================================
    const { data: currentSub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        plan:plans(*)
      `)
      .eq('user_id', customId)
      .eq('status', 'active')
      .single();

    if (subError || !currentSub) {
      console.log('[WEBHOOK] No active subscription found for user:', {
        userId: customId,
        error: subError
      });
      // This might be a new subscription, not an upgrade
      return {
        success: true,
        data: { message: 'No active subscription found - might be new subscription' }
      };
    }

    console.log('[WEBHOOK] Found current subscription:', {
      subscriptionId: currentSub.id,
      planName: currentSub.plan.name,
      oldPaypalId: currentSub.paypal_subscription_id
    });

    // ============================================================================
    // UPGRADE VALIDATION
    // ============================================================================
    // Only process if this is an upgrade from True Fan
    if (currentSub.plan.name !== 'True Fan') {
      console.log('[WEBHOOK] Not a True Fan upgrade, ignoring:', currentSub.plan.name);
      return {
        success: true,
        data: { message: `Not a True Fan upgrade: ${currentSub.plan.name}` }
      };
    }

    // ============================================================================
    // GET PAYPAL ACCESS TOKEN
    // ============================================================================
    const accessToken = await getPayPalAccessToken();
    console.log('[WEBHOOK] PayPal access token obtained');

    // ============================================================================
    // CANCEL OLD SUBSCRIPTION
    // ============================================================================
    if (currentSub.paypal_subscription_id && currentSub.paypal_subscription_id !== newPaypalSubscriptionId) {
      console.log('[WEBHOOK] Cancelling old subscription:', currentSub.paypal_subscription_id);
      
      const cancelResponse = await fetch(
        `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${currentSub.paypal_subscription_id}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            reason: 'User upgraded to higher tier plan'
          })
        }
      );

      if (cancelResponse.ok) {
        console.log('[WEBHOOK] Old subscription cancelled successfully');
      } else {
        const errorData = await cancelResponse.text();
        console.log('[WEBHOOK] Failed to cancel old subscription:', errorData);
        // Continue anyway - the new subscription is active
      }
    }

    // ============================================================================
    // GET THE WHALE PLAN
    // ============================================================================
    const { data: whalePlan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('name', 'The Whale')
      .single();

    if (planError || !whalePlan) {
      throw new Error("Could not find The Whale plan");
    }

    console.log('[WEBHOOK] Found The Whale plan:', whalePlan.id);

    // Compute credit difference between plans
    const creditDifference = CREDIT_AMOUNTS['The Whale'] - CREDIT_AMOUNTS['True Fan'];

    // Fetch current balance (for logging only)
    let priorBalance: number | null = null;
    try {
      const { data: balRow } = await supabaseAdmin.from('credits').select('balance').eq('user_id', customId).maybeSingle();
      priorBalance = balRow?.balance ?? null;
    } catch {}

    // =========================================================================
    // GRANT CREDIT DIFFERENCE (use add_user_credits RPC)
    // =========================================================================
    try {
      const { data: newBal, error: creditRpcErr } = await (supabaseAdmin as any).rpc('add_user_credits', {
        p_user_id: customId,
        p_amount: creditDifference,
        p_transaction_type: 'subscription_allowance',
        p_reference_id: currentSub.id
      });
      if (creditRpcErr) {
        throw new Error(`add_user_credits RPC failed: ${creditRpcErr.message}`);
      }
      console.log('[WEBHOOK] Credits granted via RPC. Prior balance:', priorBalance, 'New balance (reported):', newBal);
      var newBalance = newBal; // expose for response payload
    } catch (e:any) {
      throw new Error(`Failed to grant credit difference: ${e.message}`);
    }

    // =========================================================================
    // UPDATE SUBSCRIPTION (use upsert_subscription RPC)
    // =========================================================================
    const { error: upsertErr } = await (supabaseAdmin as any).rpc('upsert_subscription', {
      p_user_id: customId,
      p_plan_id: whalePlan.id,
      p_paypal_subscription_id: newPaypalSubscriptionId,
      p_status: 'active',
      p_current_period_end: null
    });
    if (upsertErr) {
      throw new Error(`Failed to upsert subscription via RPC: ${upsertErr.message}`);
    }

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    console.log('[WEBHOOK] Upgrade webhook processed successfully:', {
      userId: customId,
      oldPlan: 'True Fan',
      newPlan: 'The Whale',
      creditsGranted: creditDifference
    });

    return {
      success: true,
      data: {
        message: 'Upgrade webhook processed successfully',
        upgrade: {
          userId: customId,
          oldPlan: 'True Fan',
          newPlan: 'The Whale',
          creditsGranted: creditDifference,
          newBalance
        }
      }
    };

  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    // For webhooks, we typically return 200 to avoid retries for application errors
    // Only return 4xx/5xx for actual webhook issues
    return {
      success: false,
      data: { 
        message: 'Webhook processing failed',
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
