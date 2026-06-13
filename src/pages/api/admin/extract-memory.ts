import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseClient } from '../../../lib/supabase-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Security: Only allow POST and verify admin secret here...
  
  const { userId, chatTranscript } = req.body;

  try {
    // We force this extraction to use the cheapest, fastest model (Haiku / Nemotron)
    const extractionResponse = await fetch(`https://bedrock-mantle.${process.env.AWS_REGION}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BEDROCK_API_KEY || '',
        'openai-project': process.env.BEDROCK_WORKSPACE_ID || '',
      },
      body: JSON.stringify({
        model: 'anthropic.claude-haiku-4-5', // Cheap extraction
        messages: [{
          role: 'user',
          content: `Extract the user's OS, preferred programming language, and skill level from this transcript. Return ONLY valid JSON: ${chatTranscript}`
        }]
      })
    });

    const body = await extractionResponse.json();
    const extractedData = JSON.parse(body.choices[0].message.content);

    // Save silently to Supabase Ledger
    await supabaseClient
      .from('profiles')
      .update({ developer_profile: extractedData })
      .eq('id', userId);

    res.status(200).json({ success: true, updated: extractedData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
