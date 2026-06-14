import type { Tier } from '../types/api';

// Added the new AUTO, ADVANCED, and PREMIUM limits
export const TIER_LIMITS: Record<Tier, { context_max: number; completion_max: number; monthly_max: number }> = {
  CHAT: { context_max: 4000, completion_max: 2000, monthly_max: 100_000 },
  GIT: { context_max: 8000, completion_max: 4000, monthly_max: 50_000 },
  SANDBOX: { context_max: 16_000, completion_max: 8000, monthly_max: 25_000 },
  AUTO: { context_max: 4000, completion_max: 2000, monthly_max: 100_000 },
  ADVANCED: { context_max: 8000, completion_max: 4000, monthly_max: 50_000 },
  PREMIUM: { context_max: 32_000, completion_max: 8000, monthly_max: 20_000 },
};

const BASE_MODEL_COST = {
  input_per_1k: 0.003,
  output_per_1k: 0.015,
};

export const CACHE_DISCOUNT = 0.25;

function getTierMultiplier(tier: Tier): number {
  // Added the new tiers to the environment map
  const envMap: Record<Tier, string | undefined> = {
    CHAT: process.env.CHAT_COST_MULTIPLIER,
    GIT: process.env.GIT_COST_MULTIPLIER,
    SANDBOX: process.env.SANDBOX_COST_MULTIPLIER,
    AUTO: process.env.AUTO_COST_MULTIPLIER,
    ADVANCED: process.env.ADVANCED_COST_MULTIPLIER,
    PREMIUM: process.env.PREMIUM_COST_MULTIPLIER,
  };

  // Added the new fallback multipliers for billing
  const fallback: Record<Tier, number> = {
    CHAT: 1.5,
    GIT: 1.2,
    SANDBOX: 1.8,
    AUTO: 1.0,
    ADVANCED: 2.0,
    PREMIUM: 3.5,
  };

  const parsed = Number(envMap[tier]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback[tier];
}

export function estimateInputTokens(prompt: string): number {
  // Rough heuristic for pre-flight estimation only: ~1 token per 4 chars.
  return Math.ceil(prompt.length / 4);
}

export function estimateOutputTokens(inputTokens: number, tier: Tier): number {
  const limit = TIER_LIMITS[tier].completion_max;
  return Math.min(limit, Math.max(1, Math.ceil(inputTokens * 0.2)));
}

export function estimateCost(inputTokens: number, outputTokens: number, tier: Tier, cacheHit = false): number {
  const inputCost = (inputTokens / 1000) * BASE_MODEL_COST.input_per_1k;
  const outputCost = (outputTokens / 1000) * BASE_MODEL_COST.output_per_1k;
  const withMultiplier = (inputCost + outputCost) * getTierMultiplier(tier);
  const withCacheDiscount = cacheHit ? withMultiplier * (1 - CACHE_DISCOUNT) : withMultiplier;

  return Number(withCacheDiscount.toFixed(6));
}

export function enforceRequestTokenLimit(inputTokens: number, tier: Tier): void {
  if (inputTokens > TIER_LIMITS[tier].context_max) {
    throw new Error(`input tokens exceed ${tier} context limit of ${TIER_LIMITS[tier].context_max}`);
  }
}

export function enforceMonthlyLimit(currentMonthlyTokens: number, incomingTokens: number, tier: Tier): void {
  const monthlyMax = TIER_LIMITS[tier].monthly_max;
  if (currentMonthlyTokens + incomingTokens > monthlyMax) {
    throw new Error(`monthly token limit exceeded for ${tier}`);
  }
}
