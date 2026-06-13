import type { NextApiRequest, NextApiResponse } from 'next';

const region = process.env.AWS_REGION || 'us-east-1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, modelId } = req.body || {};

  try {
    if (!prompt || !modelId) {
      return res.status(400).json({ error: 'Prompt vector and modelId are required.' });
    }

    // Universal fetch adapter bypassing SDK strict-typing rules
    // Formats the request in standard Chat Completions JSON shape
    const response = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BEDROCK_API_KEY || '',
        'openai-project': process.env.BEDROCK_WORKSPACE_ID || '', // <-- Fix applied here
      },
      body: JSON.stringify({
        model: modelId, // Safely accepts "openai.gpt-5.4", "nvidia.nemotron...", etc.
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gateway returned HTTP ${response.status}`);
    }

    const responseBody = await response.json();

    return res.status(200).json({
      success: true,
      // Extracts text from standard OpenAI/Universal proxy response shape
      text: responseBody.choices?.[0]?.message?.content || 'No text generated.',
      usage: responseBody.usage || null,
    });

  } catch (error: any) {
    console.error('Universal Proxy Execution Error:', error);
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to execution layer',
      attempted_model: modelId
    });
  }
}
