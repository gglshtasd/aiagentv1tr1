export type Tier = 'CHAT' | 'GIT' | 'SANDBOX';

export type ExecutionModel = 'claude-3.5-sonnet' | 'llama-3.1-405b' | (string & {});

export interface ClassifyRequest {
  prompt: string;
  user_id: string;
  requested_tier: Tier;
}

export interface ClassifyResponse {
  tier: Tier;
  model: ExecutionModel;
  estimated_tokens: number;
  estimated_cost: number;
  request_id: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  requestId: string;
  timestamp: string;
}
