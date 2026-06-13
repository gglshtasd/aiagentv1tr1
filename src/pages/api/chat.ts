import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const region = process.env.AWS_REGION || 'us-east-1';
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Setup streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const writeEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if ((res as any).flush) (res as any).flush();
  };

  const { prompt, modelId, history_enabled, file_urls } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    writeEvent({ type: 'log', message: '> Validating JWT Authorization...' });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    writeEvent({ type: 'log', message: '> User authorized. Extracting Dev Context...' });
    const { data: profile } = await supabaseAdmin.from('profiles').select('developer_profile').eq('id', user.id).single();
    const memoryContext = profile?.developer_profile ? `\n<developer_context>\n${JSON.stringify(profile.developer_profile)}\n</developer_context>` : '';

    // --- MODEL ROUTING ---
    let finalModel = modelId;
    if (modelId === 'auto') {
      if (prompt.includes('function') || prompt.includes('class ') || prompt.includes('def ')) {
        finalModel = 'qwen.qwen3-coder-30b-a3b-instruct'; 
        writeEvent({ type: 'log', message: '> Auto-Router detected code. Tier: ADVANCED.' });
      } else {
        finalModel = 'qwen.qwen3-32b'; 
        writeEvent({ type: 'log', message: '> Auto-Router detected text. Tier: AUTO.' });
      }
    }
    writeEvent({ type: 'log', message: `> Assigned Target Compute: [${finalModel}]` });

    // --- PROMPT COMPRESSION ---
    let finalPrompt = prompt;
    let inputTokens = Math.ceil(prompt.length / 4);

    if (inputTokens > 4000) {
      writeEvent({ type: 'log', message: '> [WARN] Payload exceeds 4k tokens. Initiating Gemma-3-12B Compression...' });
      const compRes = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY!, 'openai-project': process.env.BEDROCK_WORKSPACE_ID! },
        body: JSON.stringify({
          model: 'google.gemma-3-12b-it',
          messages: [{ role: 'user', content: `Summarize the core intent from this input: ${prompt}` }]
        })
      });
      const compData = await compRes.json();
      finalPrompt = compData.choices?.[0]?.message?.content + "\n\n[Gateway: Compressed]";
      writeEvent({ type: 'log', message: '> [SUCCESS] Context compressed by 50%.' });
    }

    // --- LIVE BEDROCK EXECUTION ---
    let sysPrompt = `You are a helpful AI. Adhere to developer context. ${memoryContext}`;
    writeEvent({ type: 'log', message: '> Establishing secure connection to AWS Bedrock...' });

    const bedrockRes = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY!, 'openai-project': process.env.BEDROCK_WORKSPACE_ID! },
      body: JSON.stringify({
        model: finalModel,
        messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: finalPrompt }],
        max_tokens: 2048,
        stream: true // CRITICAL: Tells Bedrock to stream
      })
    });

    if (!bedrockRes.ok) throw new Error(`Gateway Error: ${bedrockRes.statusText}`);

    writeEvent({ type: 'log', message: '> [STREAMING] Incoming tokens detected. Piping to stdout...' });

    // Parse the incoming stream and forward it to the frontend
    const reader = bedrockRes.body?.getReader();
    const decoder = new TextDecoder();
    let fullAiResponse = '';

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || ''; 
        
        for (const part of parts) {
          const lines = part.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const tokenChunk = parsed.choices?.[0]?.delta?.content || '';
              if (tokenChunk) {
                fullAiResponse += tokenChunk;
                writeEvent({ type: 'token', text: tokenChunk }); // Stream token instantly
              }
            } catch (e) {}
          }
        }
      }
    }

    writeEvent({ type: 'log', message: '> Execution complete. Terminating connection.' });

    // --- DB STORAGE ---
    if (history_enabled) {
      writeEvent({ type: 'log', message: '> Committing transaction to Supabase Ledger...' });
      let convId = req.body.conversation_id;
      if (!convId) {
        const { data: newConv } = await supabaseAdmin.from('conversations').insert({ user_id: user.id, title: prompt.substring(0, 30) }).select().single();
        convId = newConv?.id;
      }
      await supabaseAdmin.from('messages').insert({ conversation_id: convId, role: 'user', content: prompt, file_urls: file_urls || [] });
      await supabaseAdmin.from('messages').insert({ conversation_id: convId, role: 'assistant', content: fullAiResponse });
      writeEvent({ type: 'log', message: '> Ledger updated successfully.' });
    }

    writeEvent({ type: 'done' });
    res.end();

  } catch (error: any) {
    writeEvent({ type: 'log', message: `> [FATAL] ${error.message}` });
    writeEvent({ type: 'error', message: error.message });
    res.end();
  }
}
