import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const region = process.env.AWS_REGION || 'us-east-1';

// Initialize Supabase Admin client to bypass RLS for server-side caching
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { prompt, modelId } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!prompt || !modelId || !token) {
    return res.status(400).json({ error: 'Missing prompt, modelId, or auth token.' });
  }

  try {
    // 1. Authenticate User & Fetch Telemetry Context
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized Access');

    // Fetch the user's silent telemetry profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('developer_profile')
      .eq('id', user.id)
      .single();

    // 2. TIER 1: Cache Check (Hash the prompt + model)
    const promptHash = crypto.createHash('sha256').update(`${modelId}:${prompt.trim().toLowerCase()}`).digest('hex');
    
    const { data: cachedResult } = await supabaseAdmin
      .from('query_cache')
      .select('response_text')
      .eq('prompt_hash', promptHash)
      .single();

    if (cachedResult) {
      console.log('🎯 TIER 1 HIT: Returning cached response (Cost: $0)');
      return res.status(200).json({
        success: true,
        text: cachedResult.response_text,
        usage: { status: 'cached', cost: '$0.00' }
      });
    }

    // 3. Invisible Context Injection
    const devContext = profile?.developer_profile 
      ? `\n<developer_context>\n${JSON.stringify(profile.developer_profile)}\n</developer_context>` 
      : '';
    
    // TIER 3: Context Compressor (Simulated check)
    // If prompt > 4000 chars, we would route to Haiku here to summarize before sending to Sonnet.
    let finalPrompt = prompt;
    if (prompt.length > 4000 && modelId.includes('sonnet')) {
        console.log('🗜️ TIER 3 TRIGGER: Compressing large prompt context...');
        // Placeholder: In production, call Haiku here to compress finalPrompt
        finalPrompt = prompt.substring(0, 4000) + '... [Context Compressed]'; 
    }

    // 4. AWS Bedrock Execution (with TIER 2 Prompt Caching compatibility block)
    const systemInstruction = `You are a helpful AI. Adhere strictly to the user's technical background if provided. ${devContext}`;

    const response = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BEDROCK_API_KEY || '',
        'openai-project': process.env.BEDROCK_WORKSPACE_ID || '',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemInstruction }, // Bedrock natively caches system block
          { role: 'user', content: finalPrompt }
        ],
        max_tokens: 1024
      })
    });

    if (!response.ok) throw new Error(`Bedrock Gateway Error: ${response.status}`);
    
    const responseBody = await response.json();
    const generatedText = responseBody.choices?.[0]?.message?.content || '';

    // 5. Store in Tier 1 Cache for the next user
    await supabaseAdmin.from('query_cache').upsert({
      prompt_hash: promptHash,
      model_id: modelId,
      response_text: generatedText
    });

    return res.status(200).json({
      success: true,
      text: generatedText,
      usage: responseBody.usage
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
