import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseClient } from '../../lib/supabase-client';

// Blocklist against prompt injection & system exploration
const SYSTEM_HACK_REGEX = /(ignore all previous instructions|system prompt|bypass|print env|cat \.env)/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, user_id, requested_tier, is_advanced_mode } = req.body;

  // 1. INPUT GUARDRAIL: Regex Blocklist
  if (SYSTEM_HACK_REGEX.test(prompt)) {
    return res.status(403).json({ 
      success: false, 
      error: 'Security Guardrail Triggered: Malicious intent detected in prompt vector.' 
    });
  }

  // 2. FINANCIAL GUARDRAIL: Verify user credit limit
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('current_spend_inr, monthly_credit_limit_inr, advanced_mode_enabled')
    .eq('id', user_id)
    .single();

  if (!profile || profile.current_spend_inr >= profile.monthly_credit_limit_inr) {
    return res.status(402).json({ 
      success: false, 
      error: 'Financial Guardrail Triggered: Monthly INR credit limit exceeded.' 
    });
  }

  // 3. ADVANCED MODE PERMISSION CHECK
  if (is_advanced_mode && !profile.advanced_mode_enabled) {
    return res.status(403).json({
      success: false,
      error: 'Your account is restricted to Auto Mode. Contact admin for Advanced Compute access.'
    });
  }

  // 4. AUTO-MODE ROUTING vs ADVANCED SELECTION
  let assignedModel = 'anthropic.claude-haiku-4-5'; // Default Auto Mode: cheapest capable model
  
  if (is_advanced_mode && req.body.manual_model_selection) {
    // In advanced mode, verify the model they manually selected is actually active in the registry
    const { data: registryCheck } = await supabaseClient
      .from('model_registry')
      .select('is_available')
      .eq('model_id', req.body.manual_model_selection)
      .single();

    if (registryCheck?.is_available) {
      assignedModel = req.body.manual_model_selection;
    } else {
      return res.status(400).json({ success: false, error: 'Selected model is offline or disabled by admin.' });
    }
  }

  // 5. ENFORCE OUTPUT TOKEN CAPS
  const maxOutputTokens = is_advanced_mode ? 4000 : 1000;

  return res.status(200).json({
    success: true,
    data: {
      model: assignedModel,
      max_tokens: maxOutputTokens,
      estimated_tokens: Math.ceil(prompt.length / 4), // Rough estimate
      estimated_cost: "0.015", // You can calculate exact markup here
      mode_used: is_advanced_mode ? 'ADVANCED' : 'AUTO'
    }
  });
}
