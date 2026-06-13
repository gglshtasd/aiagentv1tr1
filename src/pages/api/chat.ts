import type { NextApiRequest, NextApiResponse } from 'next';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Initialize the AWS Bedrock Client using your Vercel Env Variables
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Extract prompt and requested model (defaulting to Sonnet)
    const { prompt, modelId = 'anthropic.claude-3-sonnet-20240229-v1:0' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt vector is required' });
    }

    // Format the payload specifically for Claude 3 Models on Bedrock
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [
        { role: "user", content: [{ type: "text", text: prompt }] }
      ]
    };

    // Construct the execution command
    const command = new InvokeModelCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId: modelId,
    });

    // Fire the request to AWS
    const response = await bedrockClient.send(command);
    
    // Decode the response buffer back into a JSON object
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Return the successful text and token usage
    return res.status(200).json({
      success: true,
      text: responseBody.content[0].text,
      usage: responseBody.usage,
    });

  } catch (error: any) {
    console.error('Bedrock Execution Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to execution layer' 
    });
  }
}
