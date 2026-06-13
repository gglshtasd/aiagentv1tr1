import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';

const region = process.env.AWS_REGION || 'us-east-1';

// Initialize the native Anthropic SDK through the AWS Bedrock Mantle Gateway
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

  try {
    const { prompt, modelId } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt vector is required' });
    }

    // AWS Documentation Fix: Utilize Cross-Region Inference Profiles
    // Prepend the geographic routing prefix rather than stripping the ID.
    let executionModelId = modelId;
    if (executionModelId === 'anthropic.claude-3-5-sonnet-20241022-v2:0' && region === 'us-east-1') {
      executionModelId = `us.${executionModelId}`; 
      // Note: If deploying closer to your location in the future, 
      // 'apac.anthropic.claude-3-5-sonnet-20241022-v2:0' is the valid profile for Asia Pacific.
    }

    // Execute the prompt using the exact Bedrock Inference Profile ID
    const message = await anthropic.messages.create({
      model: executionModelId, 
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
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to execution layer' 
    });
  }
}
