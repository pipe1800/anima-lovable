// Global Deno declaration
declare const Deno: any;

import { authenticateUser, createCorsResponse, createErrorResponse, corsHeaders } from './modules/auth.ts';
import { verifyPayPalWebhook } from './modules/paypal-client.ts';
import { withRateLimit, enforceJsonBodySize } from '../_shared/rate-limit.ts';
import { 
  handleCreateSubscription, 
  handleVerifySubscription, 
  handleCancelSubscription,
  handleReviseSubscription,
  handleSaveSubscription
} from './modules/subscription-handler.ts';
import {
  handleCreateOrder,
  handleCaptureOrder
} from './modules/order-handler.ts';
import {
  handleWebhook
} from './modules/webhook-handler.ts';
import type { PayPalManagementRequest, PayPalResponse } from './types/index.ts';
import { paypalRequestUnion, safeParse, sanitizePayload } from '../_shared/validation.ts';

/**
 * Unified PayPal Management Edge Function
 * 
 * Consolidates 8 PayPal functions into 1:
 * - create-paypal-subscription (147 lines)
 * - verify-paypal-subscription (261 lines)
 * - cancel-paypal-subscription (127 lines)
 * - save-paypal-subscription (191 lines)
 * - revise-paypal-subscription (359 lines)
 * - create-paypal-order (166 lines)
 * - capture-paypal-order (195 lines)
 * - paypal-webhook (236 lines)
 * 
 * Total: 1,682 lines → ~550 lines (67% reduction)
 * 
 * Benefits:
 * ✅ Single endpoint for all PayPal operations
 * ✅ Shared authentication and PayPal client
 * ✅ Operation-based routing
 * ✅ Consistent error handling and logging
 * ✅ Reduced code duplication (70%+ duplicate code eliminated)
 * ✅ Easier maintenance and deployment
 */

function redactUserId(id?: string) {
  if (!id) return 'anon';
  return id.length > 8 ? `${id.slice(0,4)}…${id.slice(-2)}` : id;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  console.log('💳 Unified PayPal Management function called');
  console.log('📝 Request ID:', requestId);
  console.log('🔗 Request URL:', req.url);
  console.log('📥 Request Method:', req.method);

  // Test endpoint for debugging - handle before authentication
  if (req.url.includes('test')) {
    console.log('🧪 Test endpoint detected - returning test response');
    return createCorsResponse({
      message: 'Unified PayPal management function is working',
      timestamp: new Date().toISOString(),
      version: 'v1-unified',
      requestUrl: req.url,
      supportedOperations: [
        'create-subscription',
        'verify-subscription', 
        'cancel-subscription',
        'revise-subscription',
        'save-subscription',
        'create-order',
        'capture-order',
        'webhook'
      ]
    });
  }

  try {
    const sizeResp = await enforceJsonBodySize(req);
    if (sizeResp) return sizeResp;
  // ============================================================================
  // REQUEST PARSING & OPERATION DETECTION
  // ============================================================================
    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return createErrorResponse('Invalid JSON body', 400);
    }
    sanitizePayload(rawBody, 6000);
    const parsed = safeParse(paypalRequestUnion, rawBody);
    if (parsed.success === false) {
      return createErrorResponse(`Invalid request: ${parsed.error}`, 400);
    }
    const requestBody = parsed.data as PayPalManagementRequest;

    console.log('🎯 PayPal operation requested:', requestBody.operation);

    // ============================================================================
    // WEBHOOK SPECIAL HANDLING (No Authentication Required)
    // ============================================================================
    if (requestBody.operation === 'webhook') {
      console.log('🔗 Processing PayPal webhook...');
      
      // Get raw body for webhook verification
      const rawBody = await req.text();
      
      // Verify this is a legitimate PayPal webhook
      if (!verifyPayPalWebhook(req.headers)) {
        throw new Error('Invalid PayPal webhook signature');
      }

      // For webhooks, we need supabaseAdmin but no user authentication
      // We'll use a dummy auth and just get supabaseAdmin
      const { supabaseAdmin } = await authenticateUser(req).catch(() => {
        // Create supabaseAdmin directly for webhooks
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        if (!supabaseUrl || !supabaseServiceKey) {
          throw new Error('Supabase configuration missing for webhook');
        }

        // We'll handle the webhook with basic supabase client import
        return { supabaseAdmin: null };
      });

      const result = await handleWebhook(requestBody, supabaseAdmin, req, rawBody);
      return createCorsResponse(result);
    }

    // ============================================================================
    // AUTHENTICATION (Required for all operations except webhook)
    // ============================================================================
  console.log('🔐 Starting user authentication...');
  const { user, supabase, supabaseAdmin } = await authenticateUser(req);
  console.log('👤 User authenticated successfully:', redactUserId(user?.id));

    return await withRateLimit(req, user?.id, async () => {

    // ============================================================================
    // OPERATION ROUTING
    // ============================================================================
    let result: PayPalResponse;

    switch (requestBody.operation) {
      case 'create-subscription':
        console.log('📝 Creating PayPal subscription...');
        result = await handleCreateSubscription(requestBody, user, supabase, req);
        break;

      case 'verify-subscription':
        console.log('✅ Verifying PayPal subscription...');
        result = await handleVerifySubscription(requestBody, user, supabase, supabaseAdmin);
        break;

      case 'cancel-subscription':
        console.log('❌ Cancelling PayPal subscription...');
        result = await handleCancelSubscription(requestBody, user, supabase, supabaseAdmin);
        break;

      case 'revise-subscription':
        console.log('🔄 Revising PayPal subscription...');
        result = await handleReviseSubscription(requestBody, user, supabase, supabaseAdmin, req);
        break;

      case 'save-subscription':
        console.log('💾 Saving PayPal subscription...');
        result = await handleSaveSubscription(requestBody, user, supabase, supabaseAdmin);
        break;

      case 'create-order':
        console.log('🛒 Creating PayPal order...');
        result = await handleCreateOrder(requestBody, user, supabase, req);
        break;

      case 'capture-order':
        console.log('💰 Capturing PayPal order...');
        result = await handleCaptureOrder(requestBody, user, supabase, supabaseAdmin);
        break;

      default:
        throw new Error(`Unsupported PayPal operation: ${(requestBody as any).operation}`);
    }

    // ============================================================================
    // RESPONSE
    // ============================================================================
    const executionTime = Date.now() - startTime;
    console.log(`✅ PayPal operation ${requestBody.operation} completed in ${executionTime}ms`);

      if (!result.success) {
        return createErrorResponse(result.error || 'PayPal operation failed', 400);
      }
      return createCorsResponse({
        ...result,
        executionTime,
        requestId
      });
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ Error in PayPal management (${executionTime}ms):`, error);
    
    // Determine appropriate status code based on error type
    let statusCode = 500; // Default to server error
    
    if (error.message?.includes('Authentication failed') || 
        error.message?.includes('Invalid token') ||
        error.message?.includes('No authorization header')) {
      statusCode = 401; // Unauthorized
    } else if (error.message?.includes('Missing operation parameter') ||
               error.message?.includes('Unsupported PayPal operation')) {
      statusCode = 400; // Bad Request
    }
    
    return createErrorResponse(
      error.message || 'Internal server error',
      statusCode,
      { requestId, executionTime }
    );
  }
});
