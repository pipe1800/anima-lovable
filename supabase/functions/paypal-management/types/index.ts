import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import type { Database } from '../../../../src/integrations/supabase/types.ts';

export type PayPalSupabaseClient = SupabaseClient<Database>;
export type PayPalSupabaseAdminClient = SupabaseClient<Database>;
export type PayPalAuthenticatedUser = User & { email: string };

export interface DenoEnvGlobal {
  env: {
    get(name: string): string | undefined;
  };
}

export type PayPalOperation = 
  | 'create-subscription'
  | 'verify-subscription' 
  | 'cancel-subscription'
  | 'revise-subscription'
  | 'save-subscription'
  | 'create-order'
  | 'capture-order'
  | 'webhook';

export interface BasePayPalRequest {
  operation: PayPalOperation;
}

// Subscription Operations
export interface CreateSubscriptionRequest extends BasePayPalRequest {
  operation: 'create-subscription';
  planId: string;
  upgradeFromSubscriptionId?: string; // Optional - used for upgrades from existing subscription
  stateNonceId?: string; // Optional incoming override (should not be trusted)
}

export interface VerifySubscriptionRequest extends BasePayPalRequest {
  operation: 'verify-subscription';
  subscriptionId?: string;
  token?: string;
  state?: string; // Returned state/nonce from approval redirect
}

export interface CancelSubscriptionRequest extends BasePayPalRequest {
  operation: 'cancel-subscription';
}

export interface ReviseSubscriptionRequest extends BasePayPalRequest {
  operation: 'revise-subscription';
  subscriptionId: string;
  newPlanId: string;
}

export interface SaveSubscriptionRequest extends BasePayPalRequest {
  operation: 'save-subscription';
  subscriptionId: string;
  planId: string;
  paypalSubscriptionDetails?: PayPalSubscription;
}

// Order Operations
export interface CreateOrderRequest extends BasePayPalRequest {
  operation: 'create-order';
  creditPackId: string;
}

export interface CaptureOrderRequest extends BasePayPalRequest {
  operation: 'capture-order';
  orderID: string;
  creditPackId: string;
}

// Webhook Operation
export interface WebhookRequest extends BasePayPalRequest {
  operation: 'webhook';
  event_type: string;
  resource: PayPalSubscriptionResource;
  // No user authentication for webhooks
}

export type PayPalManagementRequest = 
  | CreateSubscriptionRequest
  | VerifySubscriptionRequest
  | CancelSubscriptionRequest
  | ReviseSubscriptionRequest
  | SaveSubscriptionRequest
  | CreateOrderRequest
  | CaptureOrderRequest
  | WebhookRequest;

// Response Types
export interface PayPalResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  subscriptionId?: string;
  orderId?: string;
  approvalUrl?: string;
  captureResult?: CaptureOrderResponse;
}

// Specific Response Types
export interface CreateSubscriptionResponse {
  subscriptionId: string;
  approvalUrl: string;
  status: string;
  state: string; // Nonce to be validated on verification
}

export interface VerifySubscriptionResponse {
  verified: boolean;
  subscriptionId: string;
  planId: string;
  status: string;
  creditsGranted?: number;
}

export interface CancelSubscriptionResponse {
  cancelled: boolean;
  subscriptionId: string;
  cancellationDate: string;
}

export interface CreateOrderResponse {
  orderId: string;
  approvalUrl: string;
  status: string;
}

export interface CaptureOrderResponse {
  orderId: string;
  captureId: string;
  status: string;
  creditsGranted: number;
}

// PayPal API Types
export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
  title?: string;
}

export interface PayPalSubscriber {
  email_address?: string;
}

export interface PayPalBillingInfo {
  next_billing_time?: string | null;
}

export interface PayPalSubscription {
  id: string;
  status: string;
  plan_id: string;
  custom_id?: string;
  subscriber?: PayPalSubscriber;
  billing_info?: PayPalBillingInfo;
  links?: PayPalLink[];
}

export interface PayPalSubscriptionListResponse {
  subscriptions?: PayPalSubscription[];
}

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalCapture {
  id?: string;
  status?: string;
  amount?: PayPalMoney;
}

export interface PayPalPurchaseUnitPayments {
  captures?: PayPalCapture[];
}

export interface PayPalPurchaseUnit {
  amount: PayPalMoney;
  description?: string;
  payments?: PayPalPurchaseUnitPayments;
}

export interface PayPalOrder {
  id: string;
  status: string;
  intent: string;
  purchase_units: PayPalPurchaseUnit[];
  links?: PayPalLink[];
}

export interface PayPalAccessToken {
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  scope: string;
}

export interface PayPalSubscriptionResource {
  id: string;
  custom_id?: string;
  plan_id?: string;
  status?: string;
}

export interface PayPalOrderCaptureResponse {
  id: string;
  status: string;
  purchase_units: PayPalPurchaseUnit[];
  payer?: {
    email_address?: string;
  };
  links?: PayPalLink[];
}

// Database Types
export interface SubscriptionRecord {
  id: string;
  user_id: string;
  plan_id: string;
  paypal_subscription_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreditPurchaseRecord {
  id: string;
  user_id: string;
  paypal_order_id: string | null;
  amount: number;
  credits_granted: number;
  status: string;
  created_at: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  price_monthly: number;
  paypal_subscription_id: string | null;
  monthly_credits_allowance: number;
}

export interface CreditPackRecord {
  id: string;
  name: string;
  price: number;
  credits_granted: number;
}

// Webhook Event Types
export type PayPalWebhookEventType = 
  | 'BILLING.SUBSCRIPTION.ACTIVATED'
  | 'BILLING.SUBSCRIPTION.CANCELLED'
  | 'BILLING.SUBSCRIPTION.SUSPENDED'
  | 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED'
  | 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
  | 'PAYMENT.CAPTURE.COMPLETED'
  | 'PAYMENT.CAPTURE.DENIED';

export interface WebhookEventData {
  event_type: PayPalWebhookEventType;
  resource: PayPalSubscriptionResource;
  summary: string;
  resource_type: string;
  create_time: string;
}
