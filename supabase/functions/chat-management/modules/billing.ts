import type { AddonSettings, CreditInfo, PlanInfo, SupabaseClient } from '../types/streaming-interfaces.ts';

/**
 * Credit calculation and billing utilities - Updated for Universal Context System per plan
 * Fixed costs per tier, no addon multipliers, all addons are free
 */

export const PLAN_MODEL_COSTS = {
  'Guest Pass': {
    model: 'mistralai/mistral-small-3.2-24b-instruct',
    cost: 10, // Fixed cost - no multipliers
    maxContextTokens: 12000,
    modelIdentifier: 'mistralai/mistral-small-3.2-24b-instruct'
  },
  'True Fan': {
    model: 'nousresearch/hermes-3-llama-3.1-70b',
    cost: 10, // Fixed cost - no multipliers
    maxContextTokens: 16000,
    modelIdentifier: 'nousresearch/hermes-3-llama-3.1-70b'
  },
  'The Whale': {
    model: 'nousresearch/hermes-3-llama-3.1-70b',
    cost: 10, // Fixed cost - no multipliers
    maxContextTokens: 24000,
    modelIdentifier: 'nousresearch/hermes-3-llama-3.1-70b'
  }
} as const;

export async function getUserPlanAndModel(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ plan: string; model: string; maxContextTokens: number; modelIdentifier: string }> {
  // Check for active subscription
  const { data: userSubscription, error: subsError } = await supabaseAdmin
    .from('billing.subscriptions')
    .select('plan_id, status, current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
    .maybeSingle();

  if (subsError) {
    console.error(`Error fetching subscription for user ${userId}:`, subsError);
    return; // Or handle error appropriately
  }

  // If user has an active subscription, check their plan
  if (userSubscription) {
    const { data: planData, error: planError } = await supabaseAdmin
      .from('billing.plans')
      .select('name')
      .eq('id', userSubscription.plan_id)
      .single();

    if (planData) {
      const planName = planData.name as keyof typeof PLAN_MODEL_COSTS;
      const planConfig = PLAN_MODEL_COSTS[planName];
      
      if (planConfig) {
        return {
          plan: planName,
          model: planConfig.model,
          maxContextTokens: planConfig.maxContextTokens,
          modelIdentifier: planConfig.modelIdentifier
        };
      }
    }

    if (planError) {
      console.error(`Error fetching plan details for user ${userId}:`, planError);
      return;
    }
  }

  // Default to Guest Pass
  const guestConfig = PLAN_MODEL_COSTS['Guest Pass'];
  return {
    plan: 'Guest Pass',
    model: guestConfig.model,
    maxContextTokens: guestConfig.maxContextTokens,
    modelIdentifier: guestConfig.modelIdentifier
  };
}

export function calculateCreditCost(
  planName: string,
  addonSettings: AddonSettings
): CreditInfo {
  const planConfig = PLAN_MODEL_COSTS[planName as keyof typeof PLAN_MODEL_COSTS];
  
  if (!planConfig) {
    console.warn(`Unknown plan: ${planName}, defaulting to Guest Pass`);
    const guestCost = PLAN_MODEL_COSTS['Guest Pass'].cost;
    return {
      baseCost: guestCost,
      addonPercentage: 0, // No addon costs in new system
      totalCost: guestCost
    };
  }

  // Fixed cost per plan - all addons are now FREE
  const baseCost = planConfig.cost;
  
  console.log(`💰 New billing system: ${planName} = ${baseCost} credits (addons included for free)`);
  
  return {
    baseCost,
    addonPercentage: 0, // All addons are free
    totalCost: baseCost // No addon multipliers
  };
}

export async function consumeCredits(
  userId: string,
  creditInfo: CreditInfo,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  console.log(`💰 Attempting credit deduction (atomic RPC) user=${userId} required=${creditInfo.totalCost}`);

  try {
    const { data: newBalance, error } = await supabaseAdmin.rpc('deduct_user_credits', {
      p_user_id: userId,
      p_amount: creditInfo.totalCost,
      p_operation_type: 'ai_operation',
      p_description: 'Chat message generation'
    });

    if (error) {
      console.error('❌ deduct_user_credits RPC error:', error);
      throw new Error('Failed to process credits');
    }

    if (!newBalance) {
      console.log('❌ Insufficient credits (RPC returned NULL)', { userId, required: creditInfo.totalCost });
      return false;
    }

    const numericBalance = Number(newBalance);
    const inferredPrevious = numericBalance + creditInfo.totalCost;
    console.log('✅ Credits consumed', {
      userId,
      deducted: creditInfo.totalCost,
      previousBalance: inferredPrevious,
      newBalance: numericBalance
    });
    return true;
  } catch (e) {
    console.error('❌ Exception during credit consumption:', e);
    throw e;
  }
}

export function createInsufficientCreditsError(creditInfo: CreditInfo): string {
  return `Insufficient credits. Required: ${creditInfo.totalCost} credits (fixed cost - addons included)`;
}

// This function is called by a cron job to reset monthly credits
export const handleMonthlyCreditReset = async (supabaseAdmin: SupabaseClient) => {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc('grant_monthly_allowances');
    if (error) {
      console.error('Error running grant_monthly_allowances RPC:', error);
    } else {
      console.log('grant_monthly_allowances processed subscriptions:', data);
    }
  } catch (e) {
    console.error('Exception running grant_monthly_allowances RPC:', e);
  }
};
