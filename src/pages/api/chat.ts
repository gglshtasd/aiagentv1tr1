// src/pages/api/chat.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { classifyTierRequest } from '../../lib/tier-classifier';
import { getSupabaseClient } from '../../lib/supabase';
import type { APIResponse, ClassifyRequest } from '../../types/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<APIResponse<any>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method not allowed', requestId: '', timestamp: new Date().toISOString() });
  }

  const userId = req.headers['x-user-id'] as string;
  const { prompt } = req.body;

  try {
    // 1. Run Pre-Flight Validation & Routing
    const classification = await classifyTierRequest({
      prompt,
      user_id: userId,
      requested_tier: 'CHAT'
    });

    // 2. TODO: Implement Prompt Compression (LLMLingua) here
    // const compressedPrompt = await compressPrompt(prompt);

    // 3. Call AWS Bedrock (Placeholder for your AWS SDK / LiteLLM fetch call)
    // const bedrockResponse = await fetch('YOUR_LITELLM_URL', { ... });
    const mockOutputTokens = 250; 
    const mockResponseText = "This is the generated AI response from AWS Bedrock.";

    // 4. Log the transaction to the Immutable Ledger
    const supabase = getSupabaseClient();
    await supabase.from('admin_requests').insert({
      user_id: userId,
      request_id: classification.request_id,
      tier: 'CHAT',
      model: classification.model,
      input_tokens: classification.estimated_tokens,
      output_tokens: mockOutputTokens,
      cost_usd: classification.estimated_cost, // Mark-up applied in tier-classifier
      status: 'completed',
      completed_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      data: { text: mockResponseText },
      requestId: classification.request_id,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      requestId: 'error',
      timestamp: new Date().toISOString()
    });
  }
}
