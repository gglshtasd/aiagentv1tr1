import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';

const region = process.env.AWS_REGION || 'us-east-1';

const anthropic = new Anthropic({
  apiKey: process.env.BEDROCK_API_KEY, 
  baseURL: `https://bedrock-mantle.${region}.api.aws/anthropic`,
  defaultHeaders: {
    "anthropic-workspace-id": process.env.BEDROCK_WORKSPACE_ID!
  }
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, modelId } = req.body || {};

  try {
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt vector is required' });
    }

    const message = await anthropic.messages.create({
      model: modelId, 
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    return res.status(200).json({
      success: true,
      text: message.content[0].type === 'text' ? message.content[0].text : 'No text response generated.',
      usage: message.usage,
    });

  } catch (error: any) {
    console.error('Bedrock Execution Error:', error);
    
    // INTERCEPT 404
    if (error.status === 404 || error.message?.includes('not_found_error')) {
      try {
        // Bypass the SDK entirely using native fetch to avoid version mismatch errors
        const fetchRes = await fetch(`https://bedrock-mantle.${region}.api.aws/anthropic/v1/models`, {
          method: 'GET',
          headers: {
            'x-api-key': process.env.BEDROCK_API_KEY || '',
            'anthropic-workspace-id': process.env.BEDROCK_WORKSPACE_ID || '',
            'anthropic-version': '2023-06-01'
          }
        });
        
        const modelsData = await fetchRes.json();
        const validIds = modelsData.data?.map((m: any) => m.id) || ['Failed to parse API response'];
        
        // This will successfully print the exact model names to your frontend
        return res.status(404).json({
          success: false,
          error: `The string '${modelId}' currently saved in your database is rejected by the Bedrock gateway.`,
          valid_models_available: validIds,
          instruction: "Please update your Supabase 'user_model_access' table to exactly match one of the valid strings above."
        });

      } catch (listError: any) {
         return res.status(500).json({
            success: false,
            error: "Could not fetch the valid models list.",
            raw_error: error.message
         });
      }
    }

    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to execution layer' 
    });
  }
}
