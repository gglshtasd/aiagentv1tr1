import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const region = process.env.AWS_REGION || 'us-east-1';

// Initialize Supabase Admin for Ledger & Memory Access
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // 1. Establish SSE Streaming Connection
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const writeEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if ((res as any).flush) (res as any).flush();
  };

  const { prompt, modelId, history_enabled, file_urls, conversation_id } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    // --- AUTHENTICATION & CONTEXT ---
    writeEvent({ type: 'log', message: '> Validating secure JWT...' });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized Access");

    writeEvent({ type: 'log', message: '> Extracting developer context profile...' });
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('developer_profile')
      .eq('id', user.id)
      .single();
      
    const memoryContext = profile?.developer_profile 
      ? `\n<context>\n${JSON.stringify(profile.developer_profile)}\n</context>` 
      : '';

    // --- AUTO-ROUTER LOGIC ---
    let finalModel = modelId;
    if (modelId === 'auto') {
      finalModel = (prompt.includes('function') || prompt.includes('class ') || prompt.includes('def '))
        ? 'anthropic.claude-3-sonnet-20240229-v1:0' // Stronger model for code
        : 'anthropic.claude-3-haiku-20240307-v1:0';  // Faster model for text
    }

    let sysPrompt = `You are an elite autonomous developer agent. Adhere to repository AGENTS.md rules strictly. ${memoryContext}`;
    let fullAiResponse = '';

    // --- EXECUTION (Bedrock Mantle Proxy) ---
    writeEvent({ type: 'log', message: `> Routing request to primary node... Target: [${finalModel}]` });
    
    const bedrockResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BEDROCK_API_KEY!,
        'openai-project': process.env.BEDROCK_WORKSPACE_ID!
      },
      body: JSON.stringify({
        model: finalModel,
        messages: [
          { role: 'system', content: sysPrompt }, 
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        stream: true // CRITICAL for the UI terminal to work
      })
    });

    if (!bedrockResponse.ok) {
        const errText = await bedrockResponse.text();
        throw new Error(`Proxy Offline: HTTP ${bedrockResponse.status} - ${errText}`);
    }

    writeEvent({ type: 'log', message: '> [STREAMING] Incoming tokens detected. Piping to stdout...' });

    // --- STREAM PARSER ---
    const reader = bedrockResponse.body?.getReader();
    const decoder = new TextDecoder();
    
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
              const chunk = parsed.choices?.[0]?.delta?.content || '';
              if (chunk) {
                fullAiResponse += chunk;
                writeEvent({ type: 'token', text: chunk });
              }
            } catch (e) {
                // Ignore incomplete JSON chunks mid-stream
            }
          }
        }
      }
    }

    // --- LOGGING & LEDGER OPERATIONS ---
    if (history_enabled) {
      writeEvent({ type: 'log', message: '> Committing session records to secure database...' });
      
      let targetConvId = conversation_id;
      
      // If the frontend didn't pass an ID, make sure we create one so messages aren't orphaned
      if (!targetConvId) {
        const { data: newConv } = await supabaseAdmin
          .from('conversations')
          .insert({ user_id: user.id, title: prompt.substring(0, 40) })
          .select().single();
        targetConvId = newConv?.id;
      }

      if (targetConvId) {
        await supabaseAdmin.from('messages').insert([
          { conversation_id: targetConvId, role: 'user', content: prompt, file_urls: file_urls || [] },
          { conversation_id: targetConvId, role: 'assistant', content: fullAiResponse }
        ]);
      }

      // Charge the execution to the ledger
      const estTokens = Math.ceil((prompt.length + fullAiResponse.length) / 4);
      const estimatedCostInr = (estTokens / 1000) * 0.5;

      if (estimatedCostInr > 0) {
        await supabaseAdmin.from('billing_ledger').insert({
          user_id: user.id,
          service_type: 'API_FALLBACK',
          amount_inr: estimatedCostInr,
          description: `AWS Execution (${finalModel}).`
        });
      }
    }

    writeEvent({ type: 'log', message: '> Workflow completed successfully.' });
    writeEvent({ type: 'done' });
    res.end();

  } catch (error: any) {
    writeEvent({ type: 'log', message: `> [FATAL ERROR] ${error.message}` });
    writeEvent({ type: 'error', message: error.message });
    res.end();
  }
}
