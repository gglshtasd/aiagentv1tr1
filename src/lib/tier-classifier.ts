// src/lib/tier-classifier.ts
import { randomUUID } from 'crypto';
import type { ClassifyRequest, ClassifyResponse, Tier } from '../types/api';
import {
  enforceMonthlyLimit,
  enforceRequestTokenLimit,
  estimateCost,
  estimateInputTokens,
  estimateOutputTokens,
} from './token-limiter';
import { 
  getMonthlyTokenUsage, 
  getUserByIdOrEmail, 
  getUserModelAccess, 
  getAvailableModels, 
  type UserModelAccessRecord, 
  type UserRecord 
} from './supabase';
import { validateClassifyRequest } from './validators';

export type ClassifierErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_USER'
  | 'UNAUTHORIZED_TIER'
  | 'LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export class ClassifierError extends Error {
  public readonly code: ClassifierErrorCode;
  public readonly requestId: string;

  constructor(code: ClassifierErrorCode, message: string, requestId: string) {
    super(message);
    this.code = code;
    this.requestId = requestId;
  }
}

export interface TierClassifierDependencies {
  validateRequest: (input: ClassifyRequest) => string[];
  getUser: (userId: string) => Promise<UserRecord | null>;
  getAccess: (userId: string, tier: Tier) => Promise<UserModelAccessRecord[]>;
  getMonthlyUsage: (userId: string, tier: Tier) => Promise<number>;
  getAvailableModels: (tier: Tier) => Promise<string[]>; 
  estimateInputTokens: (prompt: string) => number;
  estimateOutputTokens: (inputTokens: number, tier: Tier) => number;
  enforceRequestTokenLimit: (inputTokens: number, tier: Tier) => void;
  enforceMonthlyLimit: (currentMonthlyTokens: number, incomingTokens: number, tier: Tier) => void;
  estimateCost: (inputTokens: number, outputTokens: number, tier: Tier, cacheHit?: boolean) => number;
}

const defaultDependencies: TierClassifierDependencies = {
  validateRequest: validateClassifyRequest,
  getUser: getUserByIdOrEmail,
  getAccess: getUserModelAccess,
  getMonthlyUsage: getMonthlyTokenUsage,
  getAvailableModels, 
  estimateInputTokens,
  estimateOutputTokens,
  enforceRequestTokenLimit,
  enforceMonthlyLimit,
  estimateCost,
};

function makeRequestId(): string {
  return `req_${randomUUID()}`;
}

function selectModel(accessRows: UserModelAccessRecord[], availableModels: string[]): string {
  for (const model of availableModels) {
    const match = accessRows.find((row) => row.model_name === model);
    if (match) {
      return match.model_name;
    }
  }
  return accessRows[0].model_name; // Fallback
}

export async function classifyTierRequest(
  input: ClassifyRequest,
  deps: TierClassifierDependencies = defaultDependencies,
): Promise<ClassifyResponse> {
  const requestId = makeRequestId();

  const validationErrors = deps.validateRequest(input);
  if (validationErrors.length > 0) {
    throw new ClassifierError('VALIDATION_ERROR', validationErrors.join('; '), requestId);
  }

  const user = await deps.getUser(input.user_id);
  if (!user) {
    throw new ClassifierError('INVALID_USER', 'user does not exist', requestId);
  }

  const accessRows = await deps.getAccess(user.id, input.requested_tier);
  if (accessRows.length === 0) {
    throw new ClassifierError('UNAUTHORIZED_TIER', `user is not authorized for ${input.requested_tier}`, requestId);
  }

  const inputTokens = deps.estimateInputTokens(input.prompt);
  deps.enforceRequestTokenLimit(inputTokens, input.requested_tier);

  const monthlyUsage = await deps.getMonthlyUsage(user.id, input.requested_tier);
  try {
    deps.enforceMonthlyLimit(monthlyUsage, inputTokens, input.requested_tier);
  } catch (error) {
    throw new ClassifierError('LIMIT_EXCEEDED', (error as Error).message, requestId);
  }

  const availableModels = await deps.getAvailableModels(input.requested_tier);
  const selectedModel = selectModel(accessRows, availableModels);
  
  const estimatedOutputTokens = deps.estimateOutputTokens(inputTokens, input.requested_tier);
  const estimatedCost = deps.estimateCost(inputTokens, estimatedOutputTokens, input.requested_tier, false);

  return {
    tier: input.requested_tier,
    model: selectedModel,
    estimated_tokens: inputTokens,
    estimated_cost: estimatedCost,
    request_id: requestId,
  };
}
