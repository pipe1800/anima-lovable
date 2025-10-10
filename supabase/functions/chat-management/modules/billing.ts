/**
 * Credit calculation and billing utilities - Updated for Universal Context System per plan
 * Fixed costs per tier, no addon multipliers, all addons are free
 */ export const PLAN_MODEL_COSTS = {
  'Guest Pass': {
    model: 'mistralai/mistral-small-3.2-24b-instruct',
    cost: 10,
    maxContextTokens: 12000,
    modelIdentifier: 'mistralai/mistral-small-3.2-24b-instruct'
  },
  'True Fan': {
    model: 'nousresearch/hermes-3-llama-3.1-70b',
    cost: 10,
    maxContextTokens: 16000,
    modelIdentifier: 'nousresearch/hermes-3-llama-3.1-70b'
  },
  'The Whale': {
    model: 'nousresearch/hermes-3-llama-3.1-70b',
    cost: 10,
    maxContextTokens: 24000,
    modelIdentifier: 'nousresearch/hermes-3-llama-3.1-70b'
  }
};
export async function getUserPlanAndModel(userId, supabaseAdmin) {
  // Simple in-memory cache (per edge instance) to avoid hitting DB every message
  const now = Date.now();
  const cacheKey = userId;
  const ttlMs = 60_000; // 60s TTL
  const anyGlobal = globalThis;
  anyGlobal.__planCache = anyGlobal.__planCache || new Map();
  const cache = anyGlobal.__planCache;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.value;
  }
  const billingClient = supabaseAdmin.schema ? supabaseAdmin.schema('billing') : supabaseAdmin;
  // Check for active subscription
  const { data: userSubscription, error: subsError } = await billingClient.from('subscriptions').select('plan_id, status, current_period_end').eq('user_id', userId).eq('status', 'active').gt('current_period_end', new Date().toISOString()).maybeSingle();
  if (subsError) {
    console.error(`Error fetching subscription for user ${userId}:`, subsError);
    // Fall back to Guest Pass (do not return undefined)
    const guestConfig = PLAN_MODEL_COSTS['Guest Pass'];
    const value = {
      plan: 'Guest Pass',
      model: guestConfig.model,
      maxContextTokens: guestConfig.maxContextTokens,
      modelIdentifier: guestConfig.modelIdentifier
    };
    cache.set(cacheKey, {
      expires: now + ttlMs,
      value
    });
    return value;
  }
  if (userSubscription) {
    const { data: planData, error: planError } = await billingClient.from('plans').select('name').eq('id', userSubscription.plan_id).maybeSingle();
    if (!planError && planData) {
      const planName = planData.name;
      const planConfig = PLAN_MODEL_COSTS[planName] || PLAN_MODEL_COSTS['Guest Pass'];
      const value = {
        plan: planName in PLAN_MODEL_COSTS ? planName : 'Guest Pass',
        model: planConfig.model,
        maxContextTokens: planConfig.maxContextTokens,
        modelIdentifier: planConfig.modelIdentifier
      };
      cache.set(cacheKey, {
        expires: now + ttlMs,
        value
      });
      return value;
    }
  }
  // Default to Guest Pass
  const guestConfig = PLAN_MODEL_COSTS['Guest Pass'];
  const value = {
    plan: 'Guest Pass',
    model: guestConfig.model,
    maxContextTokens: guestConfig.maxContextTokens,
    modelIdentifier: guestConfig.modelIdentifier
  };
  cache.set(cacheKey, {
    expires: now + ttlMs,
    value
  });
  return value;
}
export function calculateCreditCost(planName, addonSettings) {
  const planConfig = PLAN_MODEL_COSTS[planName];
  if (!planConfig) {
    console.warn(`Unknown plan: ${planName}, defaulting to Guest Pass`);
    const guestCost = PLAN_MODEL_COSTS['Guest Pass'].cost;
    return {
      baseCost: guestCost,
      addonPercentage: 0,
      totalCost: guestCost
    };
  }
  // Fixed cost per plan - all addons are now FREE
  const baseCost = planConfig.cost;
  console.log(`💰 New billing system: ${planName} = ${baseCost} credits (addons included for free)`);
  return {
    baseCost,
    addonPercentage: 0,
    totalCost: baseCost // No addon multipliers
  };
}
export async function consumeCredits(userId, creditInfo, supabaseClient, supabaseAdminFallback) {
  console.log(`💰 Attempting credit deduction (atomic RPC) user=${userId} required=${creditInfo.totalCost}`);
  async function attempt(client, label) {
    return await client.rpc('deduct_user_credits', {
      p_user_id: userId,
      p_amount: creditInfo.totalCost,
      p_operation_type: 'ai_operation',
      p_description: 'Chat message generation'
    });
  }
  try {
    // First try with provided (user-scoped) client to satisfy auth.uid() ownership check.
    let { data: newBalance, error } = await attempt(supabaseClient, 'user');
    // If ownership check failed and we have an admin fallback, retry once.
    if (error && /ownership|assert_self|access denied/i.test(error.message || '') && supabaseAdminFallback) {
      console.warn('⚠️ Ownership check failed with user client; retrying with admin fallback');
      const retry = await attempt(supabaseAdminFallback, 'admin');
      newBalance = retry.data;
      error = retry.error;
    }
    if (error) {
      console.error('❌ deduct_user_credits RPC error:', error);
      throw new Error('Failed to process credits');
    }
    if (!newBalance) {
      console.log('❌ Insufficient credits (RPC returned NULL)', {
        userId,
        required: creditInfo.totalCost
      });
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
export function createInsufficientCreditsError(creditInfo) {
  return `Insufficient credits. Required: ${creditInfo.totalCost} credits (fixed cost - addons included)`;
}
// This function is called by a cron job to reset monthly credits
export const handleMonthlyCreditReset = async (supabaseAdmin)=>{
  try {
    const { data, error } = await supabaseAdmin.rpc('grant_monthly_allowances');
    if (error) {
      console.error('Error running grant_monthly_allowances RPC:', error);
    } else {
      console.log('grant_monthly_allowances processed subscriptions:', data);
    }
  } catch (e) {
    console.error('Exception running grant_monthly_allowances RPC:', e);
  }
};
