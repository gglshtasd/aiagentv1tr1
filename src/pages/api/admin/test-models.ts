import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin using the Service Role Key to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const region = process.env.AWS_REGION || 'us-east-1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Fetch all models currently in the registry
    const { data: models, error: fetchError } = await supabaseAdmin
      .from('model_registry')
      .select('*');

    if (fetchError || !models) {
      throw new Error('Failed to fetch models from database.');
    }

    const auditResults: any[] = [];

    // 2. Iterate through and test each model against the AWS Bedrock Proxy
    for (const model of models) {
      let isAvailable = false;
      let failureReason = null;

      try {
        // Send a tiny prompt to see if the model is alive
        const bedrockResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.BEDROCK_API_KEY!,
            'openai-project': process.env.BEDROCK_WORKSPACE_ID!
          },
          body: JSON.stringify({
            model: model.model_id,
            messages: [{ role: 'user', content: 'Ping' }],
            max_tokens: 5,
            stream: false
          })
        });

        if (bedrockResponse.ok) {
          isAvailable = true;
        } else {
          const errData = await bedrockResponse.text();
          // Extract a short snippet of the error message for the UI
          failureReason = `HTTP ${bedrockResponse.status}: ${errData.substring(0, 60)}`;
        }
      } catch (e: any) {
        failureReason = e.message;
      }

      // 3. Persist result to database ONLY if not a dry run
      if (req.query.dryRun !== 'true') {
        await supabaseAdmin
          .from('model_registry')
          .update({
            is_available: isAvailable,
            last_tested_at: new Date().toISOString()
          })
          .eq('model_id', model.model_id);
      }

      // Push result to the array returned to the frontend UI
      auditResults.push({
        model_id: model.model_id,
        status: isAvailable ? '✅ ONLINE' : '❌ OFFLINE',
        error: failureReason || 'OK'
      });
    }

    // Return the final formatted results
    return res.status(200).json({ results: auditResults });

  } catch (error: any) {
    console.error("Audit Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
