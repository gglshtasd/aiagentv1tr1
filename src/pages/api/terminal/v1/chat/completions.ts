import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { authorizeCompute } from '../../../../../lib/billing';

const region = process.env.AWS_REGION || 'us-east-1';
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Support for streaming (required by most CLI tools)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { messages, model, stream } = req.body;
  const token = req.headers.authorization?.split(' ')[1]; // Expects the Supabase JWT as the API Key

  try {
    // 1. Secure Authentication & Billing Gate via CLI
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized: Invalid CLI Token");

    const authCheck = await authorizeCompute(user.id, 0.50);
    if (!authCheck.authorized) throw new Error(`Insufficient Funds: ${authCheck.reason}`);

    // 2. Map external CLI requests to your Dev Studio Mode
    const targetModel = model.includes('qwen') ? 'qwen.qwen3-coder-30b-a3b-instruct' : 'mistral.ministral-3-8b-instruct';

    // 3. Inference Tunnel
    const bedrockResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'x-api-key': process.env.BEDROCK_API_KEY!, 
        'openai-project': process.env.BEDROCK_WORKSPACE_ID! 
      },
      body: JSON.stringify({ model: targetModel, messages, stream: true })
    });

    if (!bedrockResponse.ok) throw new Error("Upstream Provider Error");

    // 4. Passthrough Stream
    const reader = bedrockResponse.body?.getReader();
    const decoder = new TextDecoder();
    
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
        if ((res as any).flush) (res as any).flush();
      }
    }
    
    res.end();
  } catch (error: any) {
    // Return standard OpenAI error format
    res.write(`data: ${JSON.stringify({ error: { message: error.message, type: "server_error" } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
