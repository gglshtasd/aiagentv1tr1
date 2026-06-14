import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const region = process.env.AWS_REGION || 'us-east-1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Use a secret token to prevent unauthorized triggering
  if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${process.env.AZURE_VM_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { user_id, conversation_id } = req.body;

  try {
    // 1. Fetch the recent conversation
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(10);

    if (!messages || messages.length < 4) return res.status(200).json({ message: 'Not enough data to profile.' });

    const transcript = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    // 2. Use a fast, cheap model (e.g., Llama 3 8B or Gemma) to build the profile
    const prompt = `
      You are a behavioral analyst. Read this chat transcript. 
      Extract the user's technical proficiency, preferred programming languages, tone preferences, and recurring blind spots.
      Format the output STRICTLY as Markdown bullet points. Keep it under 150 words.
      Do not include any pleasantries, just the raw markdown profile.
      
      Transcript:
      ${transcript}
    `;

    const bedrockResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BEDROCK_API_KEY!,
        'openai-project': process.env.BEDROCK_WORKSPACE_ID!
      },
      body: JSON.stringify({
        model: 'google.gemma-3-4b-it', // Fast, cheap reasoning model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300
      })
    });

    const data = await bedrockResponse.json();
    const profileMarkdown = data.choices[0].message.content.trim();

    // 3. Save to Azure VM
    await fetch(`${process.env.AZURE_VM_ENDPOINT}/api/profile/${user_id}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${process.env.AZURE_VM_SECRET}` 
      },
      body: JSON.stringify({ profile_markdown: profileMarkdown })
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Shadow Profiler Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
