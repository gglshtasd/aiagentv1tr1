import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseClient } from '../../../lib/supabase-client';

const region = process.env.AWS_REGION || 'us-east-1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Fetch all models to audit
    const { data: models, error: fetchError } = await supabaseClient
      .from('model_registry')
      .select('*');

    if (fetchError || !models) {
      throw new Error(`Failed to read model list: ${fetchError?.message}`);
    }

    const auditResults = [];

    // 2. Sequentially test each model against the execution layer
    for (const model of models) {
      let isAvailable = false;
      let failureReason = null;

      try {
        const testResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.BEDROCK_API_KEY || '',
            'openai-project': process.env.BEDROCK_WORKSPACE_ID || '',
          },
          body: JSON.stringify({
            model: model.model_id,
            messages: [{ role: 'user', content: 'availability_probe_ping' }],
            max_tokens: 1 // Minimum token usage to ensure test cost is near $0
          })
        });

        if (testResponse.ok) {
          isAvailable = true;
        } else {
          const errBody = await testResponse.json().catch(() => ({}));
          failureReason = errBody.error?.message || `HTTP ${testResponse.status}`;
        }
      } catch (err: any) {
        failureReason = err.message || 'Network connection failed during probe';
      }

      // 3. Persist individual test result to database
      await supabaseClient
        .from('model_registry')
        .update({
          is_available: isAvailable,
          failure_reason: failureReason,
          last_tested_at: new Date().toISOString()
        })
        .eq('model_id', model.model_id);

      auditResults.push({
        model_id: model.model_id,
        is_available: isAvailable,
        error: failureReason
      });
    }

    return res.status(200).json({ success: true, results: auditResults });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
