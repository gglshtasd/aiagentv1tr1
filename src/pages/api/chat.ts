import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const region = process.env.AWS_REGION || 'us-east-1';
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  
  // Accept standard API payload OR OpenAI-compatible payload (for Aider/Cline integration)
  const isExternalTool = !!req.body.messages;
  let prompt = '';
  let requestedModel = req.body.model || 'auto';
  
  if (isExternalTool) {
    // Extract prompt from OpenAI standard messages array
    prompt = req.body.messages[req.body.messages.length - 1].content;
  } else {
    prompt = req.body.prompt;
    requestedModel = req.body.modelId || 'auto';
  }

  const { history_enabled, file_urls } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized: Invalid JWT");

    // --- PHASE 2: TELEMETRY & MEMORY (Mem0 / Gemma-3-4B-IT logic runs async later) ---
    const { data: profile } = await supabaseAdmin.from('profiles').select('developer_profile').eq('id', user.id).single();
    const memoryContext = profile?.developer_profile 
      ? `\n<developer_context>\n${JSON.stringify(profile.developer_profile)}\n</developer_context>` 
      : '';

    // --- PHASE 2: STRICT MODEL ROUTING MATRIX ---
    let finalModel = requestedModel;
    if (requestedModel === 'auto') {
      // Logic: Route code to Coder, chat to Standard
      if (prompt.includes('function') || prompt.includes('class ') || prompt.includes('def ')) {
        finalModel = 'qwen.qwen3-coder-30b-a3b-instruct'; // ADVANCED TIER
      } else {
        finalModel = 'qwen.qwen3-32b'; // AUTO TIER
      }
    }

    // --- PHASE 2: PROMPT COMPRESSION (LLMLingua Simulation) ---
    let finalPrompt = prompt;
    let inputTokens = Math.ceil(prompt.length / 4);

    // If prompt is large, we use the cheap Gemma-3-12B model to compress it BEFORE hitting Qwen
    if (inputTokens > 4000) {
      console.log('Initiating Gemma-3-12B Compression Pipeline...');
      const compressionRes = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY!, 'openai-project': process.env.BEDROCK_WORKSPACE_ID! },
        body: JSON.stringify({
          model: 'google.gemma-3-12b-it', // Strictly adhering to Phase 2 Matrix
          messages: [{ role: 'user', content: `Summarize the core technical intent and preserve all raw code/logs from this input. Output only the compressed technical data: ${prompt}` }]
        })
      });
      const compressionData = await compressionRes.json();
      finalPrompt = compressionData.choices?.[0]?.message?.content + "\n\n[Gateway System: Context Compressed by Gemma-3-12B]";
    }

    // --- PHASE 2: EXECUTION (Qwen / Mistral) ---
    // Inject custom Fabric-style patterns if needed based on the prompt content
    let sysPrompt = `You are a highly capable AI assistant. Adhere strictly to the provided developer context. ${memoryContext}`;
    
    if (prompt.toLowerCase().includes('review code')) {
       sysPrompt += "\nAct as a Senior Staff Engineer. Be ruthlessly critical of logic errors, security flaws, and Big-O efficiency.";
    }

    const bedrockRes = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY!, 'openai-project': process.env.BEDROCK_WORKSPACE_ID! },
      body: JSON.stringify({
        model: finalModel,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: finalPrompt }
        ],
        max_tokens: 2048
      })
    });

    const responseBody = await bedrockRes.json();
    
    // --- OPENAI COMPATIBILITY CHECK ---
    // If an external tool like Aider or VSCode Cline called this, return exactly what they expect
    if (isExternalTool) {
      return res.status(200).json(responseBody);
    }

    // Standard Next.js Frontend Return
    const aiText = responseBody.choices?.[0]?.message?.content || 'Error generating text.';

    // Chat History Tracking (Off-the-record respects the history toggle)
    if (history_enabled) {
      let convId = req.body.conversation_id;
      if (!convId) {
        const { data: newConv } = await supabaseAdmin.from('conversations').insert({ user_id: user.id, title: prompt.substring(0, 30) }).select().single();
        convId = newConv?.id;
      }
      await supabaseAdmin.from('messages').insert({ conversation_id: convId, role: 'user', content: prompt, file_urls: file_urls || [] });
      await supabaseAdmin.from('messages').insert({ conversation_id: convId, role: 'assistant', content: aiText });
    }

    return res.status(200).json({ success: true, text: aiText, model_used: finalModel });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
