import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Tier } from '../types/api';
import { UUID_REGEX, isValidEmail } from './validators';

export interface UserRecord {
  id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface UserModelAccessRecord {
  id: string;
  user_id: string;
  model_name: string;
  tier: Tier;
  max_tokens_per_month: number;
  max_tokens_per_request: number;
  cost_multiplier: number;
  enabled: boolean;
  created_at: string;
}

interface AdminRequestUsage {
  input_tokens: number;
  output_tokens: number;
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey);
  return cachedClient;
}

export async function getUserByIdOrEmail(userId: string): Promise<UserRecord | null> {
  try {
    const client = getSupabaseClient();

    const query = client.from('users').select('*').limit(1);
    const { data, error } = UUID_REGEX.test(userId)
      ? await query.eq('id', userId).maybeSingle<UserRecord>()
      : await query.eq('email', userId).maybeSingle<UserRecord>();

    if (error) {
      throw new Error(`failed to query users: ${error.message}`);
    }

    return data ?? null;
  } catch (error) {
    throw new Error(`database connection error (users): ${(error as Error).message}`);
  }
}

export async function getUserModelAccess(userId: string, tier: Tier): Promise<UserModelAccessRecord[]> {
  try {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('user_model_access')
      .select('*')
      .eq('user_id', userId)
      .eq('tier', tier)
      .eq('enabled', true)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`failed to query user_model_access: ${error.message}`);
    }

    return (data ?? []) as UserModelAccessRecord[];
  } catch (error) {
    throw new Error(`database connection error (user_model_access): ${(error as Error).message}`);
  }
}

export async function getMonthlyTokenUsage(userId: string, tier: Tier, now = new Date()): Promise<number> {
  try {
    const client = getSupabaseClient();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const { data, error } = await client
      .from('admin_requests')
      .select('input_tokens, output_tokens')
      .eq('user_id', userId)
      .eq('tier', tier)
      .gte('created_at', monthStart);

    if (error) {
      throw new Error(`failed to query admin_requests: ${error.message}`);
    }

    return ((data ?? []) as AdminRequestUsage[]).reduce((total, row) => total + row.input_tokens + row.output_tokens, 0);
  } catch (error) {
    throw new Error(`database connection error (admin_requests): ${(error as Error).message}`);
  }
}

export function isValidUserLookupValue(value: string): boolean {
  return UUID_REGEX.test(value) || isValidEmail(value);
}
// src/lib/supabase.ts

// ... (existing imports and code)

export async function getAvailableModels(tier: Tier): Promise<string[]> {
  try {
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('model_registry')
      .select('model_id')
      .eq('tier', tier)
      .eq('is_available', true);

    if (error) {
      throw new Error(`failed to query model_registry: ${error.message}`);
    }

    return (data ?? []).map((row) => row.model_id);
  } catch (error) {
    throw new Error(`database connection error (model_registry): ${(error as Error).message}`);
  }
}
