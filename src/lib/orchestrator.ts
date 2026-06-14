import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TIER_MAPPING: Record<string, number> = {
  'CHAT': 1,
  'AUTO': 2,
  'ADVANCED': 3,
  'PREMIUM': 4,
  'SANDBOX': 5, // AWS Lambda / Tools
  'GIT': 6      // CodeBuild / Heavy Repos
};

export async function authorizeCompute(userId: string, targetModelId: string) {
  try {
    // 1. Fetch User Finances
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('current_spend_inr, monthly_credit_limit_inr')
      .eq('id', userId)
      .single();
      
    if (userErr || !user) throw new Error("Failed to authenticate user profile.");
    if (user.current_spend_inr >= user.monthly_credit_limit_inr) {
      throw new Error(`INSUFFICIENT_FUNDS: Monthly limit of ₹${user.monthly_credit_limit_inr} reached.`);
    }

    // 2. Fetch Model Tier & Pricing
    const { data: model, error: modelErr } = await supabaseAdmin
      .from('model_registry')
      .select('tier, input_cost_per_1k, output_cost_per_1k, is_available')
      .eq('model_id', targetModelId)
      .single();

    if (modelErr || !model) throw new Error(`MODEL_NOT_FOUND: ${targetModelId} is not in the registry.`);
    if (!model.is_available) throw new Error(`OFFLINE: ${targetModelId} is currently unavailable.`);

    // 3. Verify Tier Access (Tiers 1-6)
    const requiredTierLevel = TIER_MAPPING[model.tier.toUpperCase()] || 1;
    const { data: perm } = await supabaseAdmin
      .from('user_tier_permissions')
      .select('is_enabled')
      .eq('user_id', userId)
      .eq('tier_level', requiredTierLevel)
      .single();

    if (!perm || !perm.is_enabled) {
      throw new Error(`TIER_LOCK: You do not have access to Tier ${requiredTierLevel} (${model.tier}) models.`);
    }

    return { authorized: true, model, userBalance: user.monthly_credit_limit_inr - user.current_spend_inr };
  } catch (error: any) {
    return { authorized: false, error: error.message };
  }
}

// System Logs Asynchronous Batching (Phase 2)
export async function logSystemEvent(level: 'info'|'warn'|'error'|'fatal', source: string, message: string, metadata: any = {}) {
  // Fire and forget to Supabase
  supabaseAdmin.from('system_logs').insert([{ level, source, message, metadata }]).then();
  
  // Forward to Azure VM (Phase 3) if environment variable is set
  if (process.env.AZURE_VM_ENDPOINT) {
    fetch(`${process.env.AZURE_VM_ENDPOINT}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.AZURE_VM_SECRET}` },
      body: JSON.stringify({ level, source, message, metadata, timestamp: new Date() })
    }).catch(() => {}); // Suppress errors to not block Vercel edge
  }
}
