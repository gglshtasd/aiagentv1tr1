import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';

// Initialize the native Anthropic SDK, but route it through AWS Bedrock
const anthropic = new Anthropic({
  apiKey: process.env.BEDROCK_API_KEY, 
  baseURL: `https://bedrock-mantle.${process.env.AWS_REGION || 'us-east-1'}.api.aws/anthropic`,
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

    // Execute the prompt using Anthropic's much simpler Messages API shape
    const message = await anthropic.messages.create({
      model: modelId,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    // Send the extracted text and token usage back to the UI
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
