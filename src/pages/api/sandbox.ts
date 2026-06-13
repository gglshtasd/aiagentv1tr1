// src/pages/api/sandbox.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { classifyTierRequest } from '../../lib/tier-classifier';
import { getSupabaseClient } from '../../lib/supabase';
import type { APIResponse } from '../../types/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<APIResponse<any>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method not allowed', requestId: '', timestamp: new Date().toISOString() });
  }

  const userId = req.headers['x-user-id'] as string;
  
  try {
    // 1. Verify User has Advanced Node Permissions
    const classification = await classifyTierRequest({
      prompt: "PROVISION_NODE", 
      user_id: userId,
      requested_tier: 'SANDBOX'
    });

    // 2. Call E2E Networks TIR API to boot the GPU node
    // Replace with actual E2E REST payload
    const e2eResponse = await fetch(`https://tir.e2enetworks.com/api/v1/projects/${process.env.E2E_PROJECT_ID}/nodes/${process.env.E2E_NODE_ID}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.E2E_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!e2eResponse.ok) throw new Error("Failed to provision E2E node");

    // 3. Log to ledger
    const supabase = getSupabaseClient();
    await supabase.from('admin_requests').insert({
      user_id: userId,
      request_id: classification.request_id,
      tier: 'SANDBOX',
      model: classification.model,
      input_tokens: 0, // Billed per minute, not by token
      status: 'provisioning',
    });

    return res.status(200).json({
      success: true,
      data: { 
        status: "Node Starting", 
        timeout_guardrail: "15_minutes_idle" 
      },
      requestId: classification.request_id,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return res.status(403).json({
      success: false,
      error: error.message,
      requestId: 'error',
      timestamp: new Date().toISOString()
    });
  }
}
