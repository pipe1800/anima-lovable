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
  const { data: userSubscription } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_id, status, current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
    .maybeSingle();

  if (userSubscription) {
    // Get plan details
    const { data: planData } = await supabaseAdmin
      .from('plans')
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
  console.log(`💰 Credit calculation: Base(${creditInfo.baseCost}) + ${creditInfo.addonPercentage}% addon increase = Total(${creditInfo.totalCost})`);

  // 1. Fetch current balance explicitly (to log & detect missing row)
  const { data: existingCredits, error: creditsSelectError } = await supabaseAdmin
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (creditsSelectError) {
    console.warn('⚠️ Credits select error (will still attempt RPC):', creditsSelectError);
  }

  let startingBalance: number | undefined = typeof existingCredits?.balance === 'number' ? existingCredits.balance : undefined;

  // 2. Auto-provision credits row if missing (legacy users predating trigger or accidental deletion)
  if (startingBalance === undefined) {
    console.log('🛠️ No credits row found; attempting to provision default row for user:', userId);
    // Attempt to derive default from active plan; fallback 1000
    let defaultAllowance = 1000;
    try {
      const { data: activeSub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_id, status, current_period_end')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_period_end', new Date().toISOString())
        .maybeSingle();
      if (activeSub?.plan_id) {
        const { data: planRow } = await supabaseAdmin
          .from('plans')
          .select('monthly_credits_allowance, name')
          .eq('id', activeSub.plan_id)
          .maybeSingle();
        if (typeof planRow?.monthly_credits_allowance === 'number') {
          defaultAllowance = planRow.monthly_credits_allowance;
          console.log('📦 Using plan allowance for new credits row:', defaultAllowance, 'plan name:', planRow.name);
        }
      }
    } catch (planLookupErr) {
      console.warn('⚠️ Plan lookup failed while provisioning credits row, using fallback 1000:', planLookupErr);
    }
    try {
      const { error: insertErr } = await supabaseAdmin
        .from('credits')
        .insert({ user_id: userId, balance: defaultAllowance });
      if (insertErr) {
        console.error('❌ Failed to auto-provision credits row:', insertErr);
      } else {
        startingBalance = defaultAllowance;
        console.log('✅ Provisioned credits row with balance:', defaultAllowance);
      }
    } catch (provisionErr) {
      console.error('❌ Exception provisioning credits row:', provisionErr);
    }
  }

  console.log('🔍 Pre-consumption balance check:', { userId, startingBalance, required: creditInfo.totalCost });

  // 3. If after provisioning we still have undefined or < required, short-circuit with explicit log
  if (startingBalance === undefined) {
    console.log(`❌ Insufficient credits for user: ${userId} balance: undefined (row missing & provisioning failed)`);
    return false;
  }
  if (startingBalance < creditInfo.totalCost) {
    console.log(`❌ Insufficient credits for user: ${userId} balance: ${startingBalance} required: ${creditInfo.totalCost}`);
    return false;
  }

  // 4. Attempt atomic consumption via RPC
  const { data: creditCheckResult, error: creditError } = await supabaseAdmin.rpc('consume_credits', {
    user_id_param: userId,
    credits_to_consume: creditInfo.totalCost
  });

  if (creditError) {
    console.error('Credit consumption error (RPC failed):', creditError);
    throw new Error('Failed to process credits');
  }

  if (!creditCheckResult) {
    // Fetch again for clarity
    const { data: afterRow } = await supabaseAdmin
      .from('credits')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();
    console.log('❌ RPC reported insufficient credits despite pre-check', {
      userId,
      startingBalance,
      postCheckBalance: afterRow?.balance,
      required: creditInfo.totalCost
    });
    return false;
  }

  console.log(`✅ Credits consumed successfully: ${creditInfo.totalCost} credits deducted (user: ${userId})`);
  return true;
}

export function createInsufficientCreditsError(creditInfo: CreditInfo): string {
  return `Insufficient credits. Required: ${creditInfo.totalCost} credits (fixed cost - addons included)`;
}
