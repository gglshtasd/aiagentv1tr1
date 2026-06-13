import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// We use the admin client here so the backend can securely check limits
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SYSTEM_HACK_REGEX = /(ignore all previous instructions|system prompt|bypass|print env|cat \.env)/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, requested_tier } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    // 1. Identify User
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Invalid Token");

    // 2. INPUT GUARDRAIL: Regex Blocklist
    if (SYSTEM_HACK_REGEX.test(prompt)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Security Guardrail Triggered: Malicious intent detected in prompt.' 
      });
    }

    // 3. FINANCIAL GUARDRAIL: Check Credit Limit & Mode
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('current_spend_inr, monthly_credit_limit_inr, advanced_mode_enabled')
      .eq('id', user.id)
      .single();

    if (!profile) throw new Error("User profile not found");

    if (profile.current_spend_inr >= profile.monthly_credit_limit_inr) {
      return res.status(402).json({ 
        success: false, 
        error: `Financial Guardrail Triggered: Monthly limit of ₹${profile.monthly_credit_limit_inr} exceeded.` 
      });
    }

    // 4. ROUTING LOGIC
    let assignedModel = 'anthropic.claude-haiku-4-5'; // Default Auto Mode
    let isAdvanced = false;

    // If the frontend requests a specific model, verify they have Advanced Mode enabled
    if (req.body.modelId && req.body.modelId !== 'auto') {
      if (!profile.advanced_mode_enabled) {
        return res.status(403).json({
          success: false,
          error: 'Account restricted to Auto Mode. Contact admin for manual model selection.'
        });
      }
      
      // Verify model is actually toggled ON in the registry
      const { data: registry } = await supabaseAdmin
        .from('model_registry')
        .select('is_available')
        .eq('model_id', req.body.modelId)
        .single();
        
      if (!registry?.is_available) {
        return res.status(400).json({ success: false, error: 'Selected model is currently disabled by Admin.' });
      }

      assignedModel = req.body.modelId;
      isAdvanced = true;
    }

    // 5. ENFORCE OUTPUT CAP
    const maxOutputTokens = isAdvanced ? 4000 : 1000;

    return res.status(200).json({
      success: true,
      data: {
        model: assignedModel,
        max_tokens: maxOutputTokens,
        estimated_tokens: Math.ceil(prompt.length / 4), 
        estimated_cost: "0.015", 
        mode_used: isAdvanced ? 'ADVANCED' : 'AUTO'
      }
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
