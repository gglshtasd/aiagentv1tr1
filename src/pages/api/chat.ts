import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with Service Role to bypass RLS for logging
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, userId, conversationId, model = 'anthropic.claude-3-sonnet-20240229-v1:0' } = req.body;

    if (!messages || !userId) {
      return res.status(400).json({ error: 'Missing required fields: messages or userId' });
    }

    // ---------------------------------------------------------------------------
    // STEP 1 & 2: Bypass LiteLLM & Restore Bedrock Mantle as Primary
    // ---------------------------------------------------------------------------
    const region = process.env.AWS_REGION || 'us-east-1';
    const bedrockUrl = `https://bedrock-mantle.${region}.api.aws/v1/chat/completions`;

    const bedrockResponse = await fetch(bedrockUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BEDROCK_API_KEY}`,
        'x-workspace-id': process.env.BEDROCK_WORKSPACE_ID as string,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
      }),
    });

    if (!bedrockResponse.ok) {
      const errorText = await bedrockResponse.text();
      console.error("Bedrock Mantle Error:", errorText);
      throw new Error(`Bedrock proxy request failed with status: ${bedrockResponse.status}`);
    }

    const data = await bedrockResponse.json();
    const assistantContent = data.choices[0]?.message?.content || "";

    // ---------------------------------------------------------------------------
    // STEP 3: Keep Ledger Logging and Memory Intact
    // ---------------------------------------------------------------------------
    
    // A. Log to long-term memory (conversations/messages)
    if (conversationId) {
      const userMessage = messages[messages.length - 1];
      await supabase.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: userMessage.content },
        { conversation_id: conversationId, role: 'assistant', content: assistantContent }
      ]);
    }

    // B. Calculate usage and log to billing_ledger
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    
    // Cost estimation logic (Example: ₹0.5 per 1k tokens - adjust as needed)
    const estimatedCostInr = ((inputTokens + outputTokens) / 1000) * 0.5;

    if (estimatedCostInr > 0) {
      await supabase.from('billing_ledger').insert({
        user_id: userId,
        service_type: 'API_FALLBACK',
        amount_inr: estimatedCostInr,
        description: `Bedrock Execution (${model})`,
      });
    }

    // Return successful completion to the client
    return res.status(200).json({
      role: 'assistant',
      content: assistantContent,
      usage: data.usage
    });

  } catch (error: any) {
    console.error("Gateway Chat Router Error:", error);
    return res.status(500).json({ 
      error: 'Gateway routing failed. Please check backend logs.',
      details: error.message 
    });
  }
}
