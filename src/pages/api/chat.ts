import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { orchestrateRequest, logSystemEvent } from '../../lib/orchestrator';

const region = process.env.AWS_REGION || 'us-east-1';
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const writeEvent = (data: any) => { res.write(`data: ${JSON.stringify(data)}\n\n`); if ((res as any).flush) (res as any).flush(); };

  const { prompt, mode = 'budget', conversation_id, incognito } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    writeEvent({ type: 'log', message: `> [AUTH] Validating secure JWT for mode: ${mode}...` });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized Access");

    if (incognito) writeEvent({ type: 'log', message: '> [SYSTEM] 🕶️ INCOGNITO ACTIVE. Database writes suspended.' });

    // Execute Orchestrator Logic
    const route = await orchestrateRequest(user.id, prompt, mode, incognito);
    if (!route.success || !route.payload) throw new Error("Orchestrator routing failed.");
    
    writeEvent({ type: 'log', message: `> [ROUTER] Assigned Workflow: ${route.payload.workflow}` });
    writeEvent({ type: 'log', message: `> [ROUTER] Target Compute: [${route.payload.model}]` });

    let formattedMessages = [];
    
    // Memory Injection
    if (conversation_id && !incognito) {
      const { data: pastMessages } = await supabaseAdmin.from('messages').select('role, content').eq('conversation_id', conversation_id).order('created_at', { ascending: true });
      if (pastMessages) {
        formattedMessages = pastMessages.map((m: any) => ({ role: m.role, content: m.content }));
        writeEvent({ type: 'log', message: `> [MEMORY] Restored ${formattedMessages.length} past turns.` });
      }
    }

    if (route.payload.injectedContext) {
       formattedMessages.unshift({ role: 'system', content: `[SHADOW PROFILE]: ${route.payload.injectedContext}` });
       writeEvent({ type: 'log', message: `> [AGENT] Shadow profile loaded into system prompt.` });
    }

    formattedMessages.push({ role: 'user', content: prompt });

    // Execute Inference
    const baseUrl = process.env.LITELLM_PROXY_URL || `https://bedrock-mantle.${region}.api.aws/v1/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (process.env.LITELLM_PROXY_URL) {
      headers['Authorization'] = `Bearer ${process.env.LITELLM_API_KEY || ''}`;
    } else {
      headers['x-api-key'] = process.env.BEDROCK_API_KEY || '';
      headers['openai-project'] = process.env.BEDROCK_WORKSPACE_ID || '';
    }

    writeEvent({ type: 'log', message: `> [NETWORK] Opening secure inference tunnel...` });
    
    let bedrockResponse = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: route.payload.model, messages: formattedMessages, stream: true })
    });

    if (!bedrockResponse.ok) {
        writeEvent({ type: 'log', message: `> [WARN] ${route.payload.model} failed. Auto-Fallback initiated...` });
        bedrockResponse = await fetch(baseUrl, {
           method: 'POST',
           headers,
           body: JSON.stringify({ model: 'mistral.ministral-3-8b-instruct', messages: formattedMessages, stream: true })
        });
        if (!bedrockResponse.ok) throw new Error(`Engine Error: ${bedrockResponse.statusText}`);
    }

    let fullAiResponse = '';
    const reader = bedrockResponse.body?.getReader();
    const decoder = new TextDecoder();
    
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((l: string) => l.startsWith('data: '));
        for (const line of lines) {
          const dataStr = line.replace('data: ', '').trim();
          if (dataStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(dataStr);
            const textChunk = parsed.choices?.[0]?.delta?.content || '';
            if (textChunk) { fullAiResponse += textChunk; writeEvent({ type: 'token', text: textChunk }); }
          } catch (e) {}
        }
      }
    }

    // Ledger Update
    if (!incognito) {
      let targetConvId = conversation_id;
      if (!targetConvId) {
        const { data: newConv } = await supabaseAdmin.from('conversations').insert({ user_id: user.id, title: prompt.substring(0, 40) }).select().single();
        targetConvId = newConv?.id;
        writeEvent({ type: 'conversation_id', id: targetConvId }); 
      }
      if (targetConvId) {
        await supabaseAdmin.from('messages').insert([
          { conversation_id: targetConvId, role: 'user', content: prompt },
          { conversation_id: targetConvId, role: 'assistant', content: fullAiResponse }
        ]);
      }
    }

    writeEvent({ type: 'log', message: '> [SYSTEM] Workflow completed successfully.' });
    writeEvent({ type: 'done' });
    res.end();

  } catch (error: any) {
    if(!incognito) await logSystemEvent('error', 'edge_routing', error.message);
    writeEvent({ type: 'log', message: `> [FATAL] ${error.message}` });
    writeEvent({ type: 'error', message: error.message });
    res.end();
  }
}
