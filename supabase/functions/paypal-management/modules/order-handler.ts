import { getPayPalAccessToken } from './paypal-client.ts';
import type { 
  PayPalManagementRequest, 
  PayPalResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CaptureOrderRequest,
  CaptureOrderResponse
} from '../types/index.ts';

/**
 * Order Operations Handler
 * 
 * Extracted from existing working functions:
 * - create-paypal-order/index.ts (167 lines)
 * - capture-paypal-order/index.ts (196 lines)
 */

/**
 * Create PayPal Order
 * Extracted from: create-paypal-order/index.ts
 * Core business logic: Subscription verification + credit pack lookup + PayPal order creation
 */
export async function handleCreateOrder(
  request: PayPalManagementRequest & CreateOrderRequest,
  user: any,
  supabase: any,
  req: Request
): Promise<PayPalResponse> {
  
  console.log('[CREATE-ORDER] Starting order creation');
  
  try {
    // ============================================================================
    // INPUT VALIDATION
    // ============================================================================
    const { creditPackId } = request;
    
    if (!creditPackId) {
      throw new Error("creditPackId is required");
    }

    console.log('[CREATE-ORDER] Request data:', { creditPackId });

    // ============================================================================
    // SUBSCRIPTION VERIFICATION
    // ============================================================================
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (subError) {
      throw new Error(`Failed to verify subscription: ${subError.message}`);
    }

    if (!subscription) {
      throw new Error('Active subscription required');
    }

    console.log('[CREATE-ORDER] Active subscription verified');

    // ============================================================================
    // CREDIT PACK LOOKUP
    // ============================================================================
    const { data: creditPack, error: packError } = await supabase
      .from('credit_packs')
      .select('name, price, credits_granted, is_active')
      .eq('id', creditPackId)
      .eq('is_active', true)
      .single();

    if (packError || !creditPack) {
      throw new Error('Credit pack not found');
    }

    console.log('[CREATE-ORDER] Credit pack found:', {
      name: creditPack.name,
      price: creditPack.price,
      credits: creditPack.credits_granted
    });

    // ============================================================================
    // GET PAYPAL ACCESS TOKEN
    // ============================================================================
    const accessToken = await getPayPalAccessToken();
    console.log('[CREATE-ORDER] PayPal access token obtained');

    // ============================================================================
    // CREATE PAYPAL ORDER
    // ============================================================================
    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: creditPack.price.toString()
          },
          description: `${creditPack.name} - ${creditPack.credits_granted} credits`
        }
      ]
    };

    const response = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create PayPal order: ${response.status} - ${errorText}`);
    }

    const paypalOrder = await response.json();
    
    console.log('[CREATE-ORDER] PayPal order created successfully:', paypalOrder.id);

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    return {
      success: true,
      data: {
        orderID: paypalOrder.id,
        amount: creditPack.price,
        description: creditPack.name
      }
    };

  } catch (error) {
    console.error('[CREATE-ORDER] Error:', error);
    throw error;
  }
}

/**
 * Capture PayPal Order
 * Extracted from: capture-paypal-order/index.ts
 * Core business logic: Order capture + purchase recording + credit granting
 */
export async function handleCaptureOrder(
  request: PayPalManagementRequest & CaptureOrderRequest,
  user: any,
  supabase: any,
  supabaseAdmin: any
): Promise<PayPalResponse> {
  
  console.log('[CAPTURE-ORDER] Starting order capture');
  
  try {
    // ============================================================================
    // INPUT VALIDATION
    // ============================================================================
    const { orderID, creditPackId } = request;
    
    if (!orderID || !creditPackId) {
      throw new Error("orderID and creditPackId are required");
    }

    console.log('[CAPTURE-ORDER] Request data:', { orderID, creditPackId });

    // ============================================================================
    // CREDIT PACK LOOKUP
    // ============================================================================
    const { data: creditPack, error: packError } = await supabase
      .from('credit_packs')
      .select('name, price, credits_granted, is_active')
      .eq('id', creditPackId)
      .eq('is_active', true)
      .single();

    if (packError || !creditPack) {
      throw new Error('Credit pack not found');
    }

    console.log('[CAPTURE-ORDER] Credit pack verified:', {
      name: creditPack.name,
      price: creditPack.price,
      credits: creditPack.credits_granted
    });

    // ============================================================================
    // GET PAYPAL ACCESS TOKEN
    // ============================================================================
    const accessToken = await getPayPalAccessToken();
    console.log('[CAPTURE-ORDER] PayPal access token obtained');

    // ============================================================================
    // CAPTURE PAYPAL ORDER
    // ============================================================================
    const response = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to capture PayPal order: ${response.status} - ${errorText}`);
    }

    const captureResult = await response.json();
    
    // ============================================================================
    // VERIFY CAPTURE SUCCESS
    // ============================================================================
    if (captureResult.status !== 'COMPLETED') {
      throw new Error(`Payment capture failed. Status: ${captureResult.status}`);
    }

    // Verify at least one capture is completed
    const hasCompletedCapture = captureResult.purchase_units.some((unit: any) =>
      unit.payments.captures.some((capture: any) => capture.status === 'COMPLETED')
    );

    if (!hasCompletedCapture) {
      throw new Error('Payment verification failed - no completed captures found');
    }

    console.log('[CAPTURE-ORDER] PayPal order captured successfully');

    // ============================================================================
    // BACKGROUND DATABASE OPERATIONS
    // ============================================================================
    const backgroundTask = async () => {
      try {
        // Record the purchase
        const { error: purchaseError } = await supabaseAdmin
          .from('credit_pack_purchases')
          .insert({
            user_id: user.id,
            credit_pack_id: creditPackId,
            amount_paid: parseFloat(creditPack.price.toString()),
            credits_granted: creditPack.credits_granted,
            paypal_order_id: orderID,
            status: 'completed'
          });

        if (purchaseError) {
          console.error('[CAPTURE-ORDER] Failed to record purchase:', purchaseError);
          return;
        }

        // Grant credits to user
        const { data: currentCredits, error: creditsError } = await supabaseAdmin
          .from('credits')
          .select('balance')
          .eq('user_id', user.id)
          .single();

        if (creditsError) {
          console.error('[CAPTURE-ORDER] Failed to fetch current credits:', creditsError);
          return;
        }

        const newBalance = currentCredits.balance + creditPack.credits_granted;
        
        const { error: updateError } = await supabaseAdmin
          .from('credits')
          .update({ balance: newBalance })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('[CAPTURE-ORDER] Failed to update credits:', updateError);
          return;
        }

        console.log(`[CAPTURE-ORDER] Successfully granted ${creditPack.credits_granted} credits to user ${user.id}`);
        
      } catch (error) {
        console.error('[CAPTURE-ORDER] Background task error:', error);
      }
    };

    // Start background task without awaiting
    // Note: For Deno Deploy edge functions, we'll run this async
    backgroundTask().catch(console.error);

    // ============================================================================
    // SUCCESS RESPONSE (IMMEDIATE)
    // ============================================================================
    console.log('[CAPTURE-ORDER] Order capture completed successfully');

    return {
      success: true,
      data: {
        orderID: captureResult.id,
        status: captureResult.status,
        creditsGranted: creditPack.credits_granted
      }
    };

  } catch (error) {
    console.error('[CAPTURE-ORDER] Error:', error);
    throw error;
  }
}
