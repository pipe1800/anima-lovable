import type { AddonSettings, CreditInfo, PlanInfo, SupabaseClient } from '../types/streaming-interfaces.ts';

/**
 * Credit calculation and billing utilities
 * Handles subscription-based model selection and credit consumption
 */

export const PLAN_MODEL_COSTS = {
  'Guest Pass': {
    model: 'openai/gpt-4o-mini',
    cost: 10
  },
  'True Fan': {
    model: 'gryphe/mythomax-l2-13b',
    cost: 4
  },
  'The Whale': {
    model: 'nousresearch/nous-hermes-2-mixtral-8x7b-dpo',
    cost: 7
  }
} as const;

export async function getUserPlanAndModel(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ plan: string; model: string }> {
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
          model: planConfig.model
        };
      }
    }
  }

  // Default to Guest Pass
  return {
    plan: 'Guest Pass',
    model: PLAN_MODEL_COSTS['Guest Pass'].model
  };
}

export function calculateCreditCost(
  planName: string,
  addonSettings: AddonSettings
): CreditInfo {
  const planConfig = PLAN_MODEL_COSTS[planName as keyof typeof PLAN_MODEL_COSTS];
  
  if (!planConfig) {
    throw new Error('Invalid plan configuration');
  }

  const baseCost = planConfig.cost;
  
  // Calculate addon percentage increase
  let addonPercentage = 0;
  if (addonSettings) {
    if (addonSettings.dynamicWorldInfo) addonPercentage += 10;
    // Enhanced Memory removed - will be variable cost based on chat length (future implementation)
    if (addonSettings.moodTracking) addonPercentage += 5;
    if (addonSettings.clothingInventory) addonPercentage += 5;
    if (addonSettings.locationTracking) addonPercentage += 5;
    if (addonSettings.timeAndWeather) addonPercentage += 5;
    if (addonSettings.relationshipStatus) addonPercentage += 5;
    if (addonSettings.characterPosition) addonPercentage += 5;
    if (addonSettings.chainOfThought) addonPercentage += 30;
    if (addonSettings.fewShotExamples) addonPercentage += 7;
  }

  const totalCost = Math.ceil(baseCost * (1 + addonPercentage / 100));

  return {
    baseCost,
    addonPercentage,
    totalCost
  };
}

export async function consumeCredits(
  userId: string,
  creditInfo: CreditInfo,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  console.log(`💰 Credit calculation: Base(${creditInfo.baseCost}) + ${creditInfo.addonPercentage}% addon increase = Total(${creditInfo.totalCost})`);

  // Check and consume credits
  const { data: creditCheckResult, error: creditError } = await supabaseAdmin.rpc('consume_credits', {
    user_id_param: userId,
    credits_to_consume: creditInfo.totalCost
  });

  if (creditError) {
    console.error('Credit consumption error:', creditError);
    throw new Error('Failed to process credits');
  }

  if (!creditCheckResult) {
    console.log('❌ Insufficient credits for user:', userId);
    return false;
  }

  console.log(`✅ Credits consumed successfully: ${creditInfo.totalCost} credits deducted`);
  return true;
}

export function createInsufficientCreditsError(creditInfo: CreditInfo): string {
  return `Insufficient credits. Required: ${creditInfo.totalCost} credits (${creditInfo.baseCost} base + ${creditInfo.addonPercentage}% addon increase)`;
}
