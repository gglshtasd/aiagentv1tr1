import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

// 1. Initialize Supabase Admin Client for Ledger & Memory Access
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2. Initialize Native AWS Bedrock Client (The Failsafe Anchor)
const bedrockFailsafeClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Establish Server-Sent Events (SSE) streaming connection to the frontend
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
    // --- 1. AUTHENTICATION & MEMORY EXTRACTION ---
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

    // --- 2. AUTO-ROUTER LOGIC ---
    let finalModel = modelId;
    if (modelId === 'auto') {
      finalModel = (prompt.includes('function') || prompt.includes('class ') || prompt.includes('def '))
        ? 'qwen.qwen3-coder-30b-a3b-instruct'
        : 'qwen.qwen3-32b';
    }

    let sysPrompt = `You are an elite autonomous developer agent. Adhere to repository AGENTS.md rules strictly. ${memoryContext}`;
    let fullAiResponse = '';
    let usedFailsafeBackup = false;

    // --- 3. PRIMARY EXECUTION (Azure VM LiteLLM Proxy) ---
    try {
      writeEvent({ type: 'log', message: `> Routing request to primary proxy... Target: [${finalModel}]` });
      
      const proxyResponse = await fetch(process.env.LITELLM_PROXY_URL!, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.LITELLM_MASTER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: finalModel,
          messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: prompt }],
          max_tokens: 4000,
          stream: true
        })
      });

      if (!proxyResponse.ok) throw new Error(`Proxy Offline: HTTP ${proxyResponse.status}`);

      // Parse LiteLLM SSE Stream
      const reader = proxyResponse.body?.getReader();
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
              } catch (e) {}
            }
          }
        }
      }

    } catch (proxyError: any) {
      // --- 4. FAILSAFE EXECUTION (Native AWS Bedrock) ---
      console.warn("⚠️ Proxy offline. Deploying AWS Bedrock Native Failsafe.");
      writeEvent({ type: 'log', message: '⚠️ [WARN] Primary Node Offline. Swapping route to AWS Bedrock Failsafe...' });
      usedFailsafeBackup = true;

      // Translate model target to Bedrock's exact ARN format
      const bedrockModelTarget = finalModel.includes('qwen') 
        ? 'anthropic.claude-3-5-sonnet-20240620-v1:0' // AWS mapped fallback
        : finalModel;

      const bedrockPayload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4000,
        system: sysPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
      };

      const command = new InvokeModelWithResponseStreamCommand({
        contentType: "application/json",
        body: JSON.stringify(bedrockPayload),
        modelId: bedrockModelTarget,
      });

      const bedrockResponse = await bedrockFailsafeClient.send(command);
      
      // Parse Bedrock Async Iterable Stream
      if (bedrockResponse.body) {
        const decoder = new TextDecoder();
        for await (const chunk of bedrockResponse.body) {
          if (chunk.chunk?.bytes) {
            const jsonString = decoder.decode(chunk.chunk.bytes);
            const parsed = JSON.parse(jsonString);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const tokenText = parsed.delta.text;
              fullAiResponse += tokenText;
              writeEvent({ type: 'token', text: tokenText });
            }
          }
        }
      }
    }

    // --- 5. LOGGING & LEDGER OPERATIONS ---
    if (history_enabled) {
      writeEvent({ type: 'log', message: '> Committing session records to secure database...' });
      let targetConvId = conversation_id;
      
      // Create new conversation thread if none exists
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

      // If the direct AWS fallback path was used, document a minor API charge to the ledger
      if (usedFailsafeBackup) {
        await supabaseAdmin.from('billing_ledger').insert({
          user_id: user.id,
          service_type: 'API_FALLBACK',
          amount_inr: 0.15, // Low flat cost per fallback query instance
          description: `AWS Failsafe backup invoked for query mapping to ${finalModel}.`
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
