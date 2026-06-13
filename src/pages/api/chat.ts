import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';

const region = process.env.AWS_REGION || 'us-east-1';

// The bedrock-mantle gateway acts as a perfect Anthropic API clone.
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

  // FIX: Destructure outside the try-catch block so 'modelId' is globally scoped for this handler
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
    
    // modelId is now safely accessible here
    if (error.status === 404 || error.message?.includes('not_found_error')) {
      try {
        const modelsList = await anthropic.models.list();
        const validIds = modelsList.data.map((m: any) => m.id);
        
        return res.status(404).json({
          success: false,
          error: `Model ID '${modelId}' is not recognized by this Bedrock workspace.`,
          valid_models_available: validIds,
          instruction: "Update your database with one of the valid strings listed above."
        });
      } catch (listError) {
         console.error("Could not fetch models list", listError);
      }
    }

    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to execution layer' 
    });
  }
}
