// Replaces the old Tier type to match our new Supabase Registry
export type Tier = 'CHAT' | 'GIT' | 'SANDBOX' | 'AUTO' | 'ADVANCED' | 'PREMIUM';

export type ExecutionModel = string;

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
  tool_routing?: any; // Added to support our future JSON Router Agent
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  requestId: string;
  timestamp: string;
}
