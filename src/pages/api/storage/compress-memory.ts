import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { conversation_id, messages } = req.body;
  const AZURE_ENDPOINT = process.env.AZURE_VM_ENDPOINT;
  const AZURE_SECRET = process.env.AZURE_VM_SECRET;

  try {
    // 1. Summarize using a cheap model (Gemma 4B)
    const summaryResponse = await fetch(`https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY! },
      body: JSON.stringify({
        model: 'google.gemma-3-4b-it',
        messages: [{ role: 'user', content: `Summarize this chat history concisely: ${JSON.stringify(messages)}` }],
        temperature: 0.1
      })
    });
    
    const summaryData = await summaryResponse.json();
    const summary = summaryData.choices[0].message.content;

    // 2. Fire-and-forget sync to Azure VM (Zero-egress footprint)
    await fetch(`${AZURE_ENDPOINT}/api/telemetry`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${AZURE_SECRET}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        conversation_id,
        compressed_summary: summary
      })
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Compression failed' });
  }
}
