import type { NextApiRequest, NextApiResponse } from 'next';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// Initialize the native AWS client (No more bedrock-mantle proxy)
const bedrockRuntime = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
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

    // Format the payload natively for Bedrock's Claude integration
    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const command = new InvokeModelCommand({
      // You can now safely pass your native AWS Bedrock strings here
      // e.g., 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
      modelId: modelId, 
      body: body,
      contentType: "application/json",
      accept: "application/json",
    });

    const response = await bedrockRuntime.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return res.status(200).json({
      success: true,
      text: responseBody.content[0].text,
      usage: responseBody.usage || null,
    });

  } catch (error: any) {
    console.error('Native AWS Bedrock Execution Error:', error);
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to execution layer',
      attempted_model: modelId
    });
  }
}
