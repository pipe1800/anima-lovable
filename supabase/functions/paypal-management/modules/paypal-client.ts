import type {
  PayPalAccessToken,
  PayPalOrder,
  PayPalOrderCaptureResponse,
  PayPalSubscription,
  DenoEnvGlobal,
} from '../types/index.ts';
// Declare Deno for type-checking in non-Deno environments
declare const Deno: DenoEnvGlobal;

const PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com'; // TODO: Switch to production URL

interface PayPalAccessTokenResponse {
  access_token: string;
  token_type?: string;
  app_id?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * Get PayPal access token for API calls
 * This function is used across multiple PayPal operations
 */
export async function getPayPalAccessToken(): Promise<string> {
  const clientId =
    (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env?.get(
      'PAYPAL_CLIENT_ID',
    ) ?? (typeof process !== 'undefined' ? process.env.PAYPAL_CLIENT_ID : undefined);
  const clientSecret =
    (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env?.get(
      'PAYPAL_CLIENT_SECRET',
    ) ?? (typeof process !== 'undefined' ? process.env.PAYPAL_CLIENT_SECRET : undefined);
  
  console.log('[PAYPAL-CLIENT] Checking credentials:', { 
    clientIdExists: !!clientId, 
    clientSecretExists: !!clientSecret,
    clientIdLength: clientId?.length || 0,
    clientSecretLength: clientSecret?.length || 0
  });
  
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  console.log('[PAYPAL-CLIENT] Making token request to:', `${PAYPAL_BASE_URL}/v1/oauth2/token`);

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  console.log('[PAYPAL-CLIENT] Token request response:', { 
    status: response.status, 
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries())
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PAYPAL-CLIENT] Token request failed:', errorText);
    throw new Error(`Failed to get PayPal access token: ${response.status} - ${errorText}`);
  }

  const raw = (await response.json()) as PayPalAccessTokenResponse;
  // Minimal runtime validation before casting
  if (!raw || typeof raw.access_token !== 'string') {
    throw new Error('Malformed PayPal token response');
  }
  const tokenData: PayPalAccessToken = {
    access_token: raw.access_token,
    token_type: raw.token_type ?? 'Bearer',
    app_id: raw.app_id ?? '',
    expires_in: typeof raw.expires_in === 'number' ? raw.expires_in : 0,
    scope: raw.scope ?? ''
  };
  console.log('[PAYPAL-CLIENT] Token obtained successfully:', { 
    tokenType: tokenData.token_type,
    expiresIn: tokenData.expires_in,
    tokenLength: tokenData.access_token?.length || 0
  });
  
  return tokenData.access_token;
}

/**
 * Make authenticated PayPal API request
 */
export async function paypalApiRequest<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
  accessToken?: string
): Promise<T> {
  const token = accessToken || await getPayPalAccessToken();
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Add Prefer header for POST requests that return data
  if (method === 'POST') {
    headers['Prefer'] = 'return=representation';
  }

  const response = await fetch(`${PAYPAL_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error(`PayPal API ${method} ${endpoint} failed:`, responseText);
    throw new Error(`PayPal API request failed: ${response.status} ${responseText}`);
  }

  // Return parsed JSON or empty object for empty responses
  return responseText ? (JSON.parse(responseText) as T) : ({} as T);
}

/**
 * Create PayPal subscription
 */
export async function createPayPalSubscription(
  planId: string,
  subscriberEmail: string,
  returnUrl: string,
  cancelUrl: string
) {
  const subscriptionData = {
    plan_id: planId,
    subscriber: {
      email_address: subscriberEmail
    },
    application_context: {
      brand_name: 'Anima AI',
      locale: 'en-US',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
      payment_method: {
        payer_selected: 'PAYPAL',
        payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
      },
      return_url: returnUrl,
      cancel_url: cancelUrl
    }
  };

  return await paypalApiRequest<PayPalSubscription>(
    '/v1/billing/subscriptions',
    'POST',
    subscriptionData,
  );
}

/**
 * Get PayPal subscription details
 */
export async function getPayPalSubscription(subscriptionId: string) {
  return await paypalApiRequest<PayPalSubscription>(
    `/v1/billing/subscriptions/${subscriptionId}`,
  );
}

/**
 * Cancel PayPal subscription
 */
export async function cancelPayPalSubscription(subscriptionId: string, reason?: string) {
  const cancelData = {
    reason: reason || 'User requested cancellation'
  };

  return await paypalApiRequest(
    `/v1/billing/subscriptions/${subscriptionId}/cancel`,
    'POST',
    cancelData
  );
}

/**
 * Revise PayPal subscription (change plan)
 */
export async function revisePayPalSubscription(
  subscriptionId: string,
  newPlanId: string,
) {
  const revisionData = {
    plan_id: newPlanId,
    application_context: {
      brand_name: 'Anima AI',
      locale: 'en-US',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'CONTINUE'
    }
  };

  return await paypalApiRequest<PayPalSubscription>(
    `/v1/billing/subscriptions/${subscriptionId}/revise`,
    'POST',
    revisionData,
  );
}

/**
 * Create PayPal order for one-time payments
 */
export async function createPayPalOrder(
  amount: string,
  description: string,
  returnUrl: string,
  cancelUrl: string
) {
  const orderData = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: 'USD',
        value: amount
      },
      description: description
    }],
    application_context: {
      brand_name: 'Anima AI',
      locale: 'en-US',
      landing_page: 'BILLING',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl
    }
  };

  return await paypalApiRequest<PayPalOrder>('/v2/checkout/orders', 'POST', orderData);
}

/**
 * Capture PayPal order payment
 */
export async function capturePayPalOrder(orderId: string) {
  return await paypalApiRequest<PayPalOrderCaptureResponse>(
    `/v2/checkout/orders/${orderId}/capture`,
    'POST',
  );
}

/**
 * Verify PayPal webhook signature (basic verification)
 */
export function verifyPayPalWebhook(headers: Headers): boolean {
  // Basic webhook verification - in production, should implement full signature verification
  const authAlgo = headers.get('PAYPAL-AUTH-ALGO');
  const transmissionId = headers.get('PAYPAL-TRANSMISSION-ID');
  const certId = headers.get('PAYPAL-CERT-ID');
  const signature = headers.get('PAYPAL-TRANSMISSION-SIG');
  
  // For now, just check that required headers are present
  return !!(authAlgo && transmissionId && certId && signature);
}

export { PAYPAL_BASE_URL };
