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
}

export interface VerifySubscriptionRequest extends BasePayPalRequest {
  operation: 'verify-subscription';
  subscriptionId?: string;
  token?: string;
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
  paypalSubscriptionDetails?: any;
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
  resource: any;
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
  data?: any;
  error?: string;
  subscriptionId?: string;
  orderId?: string;
  approvalUrl?: string;
  captureResult?: any;
}

// Specific Response Types
export interface CreateSubscriptionResponse {
  subscriptionId: string;
  approvalUrl: string;
  status: string;
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
export interface PayPalSubscription {
  id: string;
  status: string;
  plan_id: string;
  subscriber: {
    email_address: string;
  };
  billing_info?: any;
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalOrder {
  id: string;
  status: string;
  intent: string;
  purchase_units: Array<{
    amount: {
      currency_code: string;
      value: string;
    };
    description?: string;
  }>;
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalAccessToken {
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  scope: string;
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
  credits_per_month: number;
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
  resource: any;
  summary: string;
  resource_type: string;
  create_time: string;
}
