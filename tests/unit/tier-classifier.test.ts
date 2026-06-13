// tests/unit/tier-classifier.test.ts
import { describe, expect, it } from 'vitest';
import { classifyTierRequest, ClassifierError, type TierClassifierDependencies } from '../../src/lib/tier-classifier';
import { estimateCost, estimateInputTokens } from '../../src/lib/token-limiter';
import type { ClassifyRequest, Tier } from '../../src/types/api';

const validUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  role: 'user',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function makeDeps(overrides: Partial<TierClassifierDependencies> = {}): TierClassifierDependencies {
  return {
    validateRequest: () => [],
    getUser: async () => validUser,
    getAvailableModels: async (tier) => tier === 'CHAT' ? ['claude-3.5-sonnet'] : ['llama-3.1-405b'], // NEW MOCK INJECTED HERE
    getAccess: async (userId, tier) => [
      {
        id: 'a',
        user_id: userId,
        model_name: tier === 'CHAT' ? 'claude-3.5-sonnet' : 'llama-3.1-405b',
        tier,
        max_tokens_per_month: 100000,
        max_tokens_per_request: 4000,
        cost_multiplier: 1,
        enabled: true,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    getMonthlyUsage: async () => 100,
    estimateInputTokens,
    estimateOutputTokens: (inputTokens, tier) => {
      const completionMax = tier === 'CHAT' ? 2000 : tier === 'GIT' ? 4000 : 8000;
      return Math.min(completionMax, Math.max(1, Math.ceil(inputTokens * 0.2)));
    },
    enforceRequestTokenLimit: () => undefined,
    enforceMonthlyLimit: () => undefined,
    estimateCost,
    ...overrides,
  };
}

function makeRequest(tier: Tier, prompt = 'hello world'): ClassifyRequest {
  return {
    prompt,
    user_id: validUser.id,
    requested_tier: tier,
  };
}

describe('tier-classifier', () => {
  it('classifies valid user with CHAT tier', async () => {
    const result = await classifyTierRequest(makeRequest('CHAT'), makeDeps());
    expect(result.tier).toBe('CHAT');
    expect(result.model).toBe('claude-3.5-sonnet');
  });

  it('classifies valid user with GIT tier', async () => {
    const result = await classifyTierRequest(makeRequest('GIT'), makeDeps());
    expect(result.tier).toBe('GIT');
    expect(result.model).toBe('llama-3.1-405b');
  });

  it('classifies valid user with SANDBOX tier', async () => {
    const result = await classifyTierRequest(makeRequest('SANDBOX'), makeDeps());
    expect(result.tier).toBe('SANDBOX');
    expect(result.model).toBe('llama-3.1-405b');
  });

  it('rejects unknown user', async () => {
    await expect(classifyTierRequest(makeRequest('CHAT'), makeDeps({ getUser: async () => null }))).rejects.toMatchObject({
      code: 'INVALID_USER',
    });
  });

  it('rejects user without tier access', async () => {
    await expect(classifyTierRequest(makeRequest('GIT'), makeDeps({ getAccess: async () => [] }))).rejects.toMatchObject({
      code: 'UNAUTHORIZED_TIER',
    });
  });

  it('rejects invalid prompt that exceeds max length', async () => {
    await expect(
      classifyTierRequest(
        makeRequest('CHAT', 'x'.repeat(10001)),
        makeDeps({ validateRequest: () => ['prompt exceeds max length of 10,000 characters'] }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid tier', async () => {
    await expect(
      classifyTierRequest(
        { prompt: 'ok', user_id: validUser.id, requested_tier: 'INVALID' as Tier },
        makeDeps({ validateRequest: () => ['requested_tier must be one of CHAT, GIT, SANDBOX'] }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('calculates tokens correctly', async () => {
    const prompt = 'a'.repeat(40);
    const result = await classifyTierRequest(makeRequest('CHAT', prompt), makeDeps());
    expect(result.estimated_tokens).toBe(10);
  });

  it('calculates cost with multiplier correctly', async () => {
    const prompt = 'a'.repeat(4000);
    const result = await classifyTierRequest(makeRequest('CHAT', prompt), makeDeps());
    const expectedCost = estimateCost(1000, 200, 'CHAT');
    expect(result.estimated_cost).toBe(expectedCost);
  });

  it('rejects when monthly token limit would be exceeded', async () => {
    const deps = makeDeps({
      enforceMonthlyLimit: () => {
        throw new Error('monthly token limit exceeded for CHAT');
      },
    });

    await expect(classifyTierRequest(makeRequest('CHAT'), deps)).rejects.toBeInstanceOf(ClassifierError);
    await expect(classifyTierRequest(makeRequest('CHAT'), deps)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });
});
