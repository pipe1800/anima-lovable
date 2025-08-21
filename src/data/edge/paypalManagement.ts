import { callEdgeFunction } from './core/client';
import { EdgeFunctionError } from './core/types';

// Common response shape
export interface PayPalEdgeResult<T = any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  success?: boolean;
  data?: T;
  error?: string;
  [key: string]: any; // passthrough
}

// Operation payloads
export interface CreateSubscriptionPayload { planId: string; upgradeFromSubscriptionId?: string | null; }
export interface VerifySubscriptionPayload { subscriptionId: string; state?: string | null; }
export interface CreateCreditOrderPayload { creditPackId: string; }
export interface CaptureCreditOrderPayload { token: string; payerId?: string | null; packId?: string | null; }

const FN = 'paypal-management';

export const PayPalManagement = {
  createSubscription: (payload: CreateSubscriptionPayload) =>
    callEdgeFunction<PayPalEdgeResult>(FN, { operation: 'create-subscription', ...payload }),
  verifySubscription: (payload: VerifySubscriptionPayload) =>
    callEdgeFunction<PayPalEdgeResult>(FN, { operation: 'verify-subscription', ...payload }),
  createCreditOrder: (payload: CreateCreditOrderPayload) =>
    callEdgeFunction<PayPalEdgeResult>(FN, { operation: 'create-order', ...payload }),
  captureCreditOrder: (payload: CaptureCreditOrderPayload) =>
    callEdgeFunction<PayPalEdgeResult>(FN, { operation: 'capture-order', ...payload })
};

export default PayPalManagement;
