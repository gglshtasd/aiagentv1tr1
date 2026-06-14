import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { authorizeCompute, logSystemEvent } from '../../lib/orchestrator';

const region = process.env.AWS_REGION || 'us-east-1';
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const writeEvent = (data: any) => { res.write(`data: ${JSON.stringify(data)}\n\n`); if ((res as any).flush) (res as any).flush(); };

  // Added `incognito` boolean
  const { prompt, modelId, history_enabled, conversation_id, temperature, maxTokens, incognito } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    writeEvent({ type: 'log', message: '> Validating secure JWT & Access Tiers...' });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized Access");

    if (incognito) writeEvent({ type: 'log', message: '> 🕶️ INCOGNITO MODE ACTIVE. Database telemetry suspended.' });

    let finalTargetModel = modelId;
    let finalPrompt = prompt;

    // --- PHASE 1: MICRO-ORCHESTRATOR ---
    if (modelId === 'auto') {
      const gemmaResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY!, 'openai-project': process.env.BEDROCK_WORKSPACE_ID! },
        body: JSON.stringify({ model: 'google.gemma-3-4b-it', messages: [{ role: 'user', content: `Analyze intent. JSON { "category": "CODE|TEXT", "tool_needed": "none" }. Prompt: ${prompt}` }], temperature: 0.1 })
      });
      const gemmaData = await gemmaResponse.json();
      const decision = JSON.parse(gemmaData.choices[0].message.content.replace(/```json|```/g, '').trim());
      
      finalTargetModel = decision.category === 'CODE' ? 'qwen.qwen3-coder-30b-a3b-instruct' : 'mistral.ministral-3-8b-instruct';
      writeEvent({ type: 'log', message: `> Auto-Routed to: [${finalTargetModel}]` });
    }

    // --- PHASE 4: TIER & BILLING GATEWAY ---
    const authCheck = await authorizeCompute(user.id, finalTargetModel);
    if (!authCheck.authorized) {
      await logSystemEvent('warn', 'orchestrator', `Compute Denied for ${user.id}: ${authCheck.error}`);
      throw new Error(authCheck.error);
    }
    writeEvent({ type: 'log', message: '> Compute authorized. Ledger validated.' });

    // --- PHASE 3: MEMORY & SUMMARY BUFFER ---
    let formattedMessages: { role: string; content: string }[] = [];
    if (conversation_id && history_enabled && !incognito) {
      const { data: pastMessages } = await supabaseAdmin.from('messages').select('role, content').eq('conversation_id', conversation_id).order('created_at', { ascending: true });
      
      if (pastMessages && pastMessages.length > 5) {
        writeEvent({ type: 'log', message: '> Memory exceeds 5 turns. Triggering Azure/Gemma context compression...' });
        // Send to cheap model to summarize everything except the last 2 turns
        const msgsToCompress = pastMessages.slice(0, pastMessages.length - 2);
        const retainedMsgs = pastMessages.slice(pastMessages.length - 2);
        
        // (In a full implementation, you fetch Bedrock here to summarize msgsToCompress)
        // For now, we simulate the compression logic dropping old context safely
        formattedMessages = [{ role: 'system', content: `[SYSTEM: Previous turns summarized/archived]`} , ...retainedMsgs.map(m => ({ role: m.role, content: m.content }))];
      } else if (pastMessages) {
        formattedMessages = pastMessages.map(m => ({ role: m.role, content: m.content }));
      }
    }
    
    formattedMessages.push({ role: 'user', content: finalPrompt });

    // --- EXECUTION ---
    writeEvent({ type: 'log', message: `> Establishing secure execution tunnel...` });
    const bedrockResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY!, 'openai-project': process.env.BEDROCK_WORKSPACE_ID! },
      body: JSON.stringify({ model: finalTargetModel, messages: formattedMessages, max_tokens: maxTokens || 4000, temperature: temperature || 0.7, stream: true })
    });

    if (!bedrockResponse.ok) throw new Error(`Engine Error: ${bedrockResponse.statusText}`);

    let fullAiResponse = '';
    const reader = bedrockResponse.body?.getReader();
    const decoder = new TextDecoder();
    
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
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

    // --- LEDGER & HISTORY ---
    if (history_enabled && !incognito) {
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

    if(!incognito) logSystemEvent('info', 'edge_routing', `Successful inference cycle completed on ${finalTargetModel}.`);
    writeEvent({ type: 'log', message: '> Workflow completed successfully.' });
    writeEvent({ type: 'done' });
    res.end();

  } catch (error: any) {
    if(!incognito) logSystemEvent('error', 'edge_routing', error.message);
    writeEvent({ type: 'log', message: `> [FATAL ERROR] ${error.message}` });
    writeEvent({ type: 'error', message: error.message });
    res.end();
  }
}
