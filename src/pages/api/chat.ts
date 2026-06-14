import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const region = process.env.AWS_REGION || 'us-east-1';
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const writeEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if ((res as any).flush) (res as any).flush();
  };

  const { prompt, modelId, history_enabled, conversation_id } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    writeEvent({ type: 'log', message: '> Validating secure JWT...' });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized Access");

    let finalTargetModel = modelId;
    let finalPrompt = prompt;

    // --- PHASE 1: MICRO-ORCHESTRATOR (Only if AUTO mode is selected) ---
    if (modelId === 'auto') {
      writeEvent({ type: 'log', message: '> Booting Micro-Orchestrator (Google Gemma 3 4B)...' });
      
      const orchestratorPrompt = `
        Analyze the user prompt. Determine the best model from: 'qwen-3-coder-30b', 'deepseek-v3-2', or 'qwen-3-32b'.
        Determine if a tool is needed: 'none', 'github_actions', or 'codebuild'.
        Compress the prompt to save tokens.
        Return ONLY JSON: {"target_model": "name", "tool_needed": "none", "compressed_prompt": "..."}
        Prompt: ${prompt}
      `;

      const gemmaResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.BEDROCK_API_KEY!,
          'openai-project': process.env.BEDROCK_WORKSPACE_ID!
        },
        body: JSON.stringify({
          model: 'google.gemma-3-4b-it', // Fixed: Added 'google.' prefix for AWS proxy routing
          messages: [{ role: 'user', content: orchestratorPrompt }],
          max_tokens: 500,
          temperature: 0.1,
          stream: false // Explicitly disable stream for JSON response
        })
      });

      if (!gemmaResponse.ok) {
        const errorText = await gemmaResponse.text();
        throw new Error(`Proxy Rejected Orchestrator [HTTP ${gemmaResponse.status}]: ${errorText}`);
      }
      
      const gemmaData = await gemmaResponse.json();
      let routerDecision;
      try {
        routerDecision = JSON.parse(gemmaData.choices[0].message.content.replace(/```json|```/g, '').trim());
      } catch (e) {
        throw new Error(`Orchestrator returned invalid JSON: ${gemmaData.choices[0].message.content}`);
      }

      writeEvent({ type: 'log', message: `> Decision: Route to [${routerDecision.target_model}]. Tool: [${routerDecision.tool_needed}]` });
      
      if (routerDecision.tool_needed !== 'none') {
        writeEvent({ type: 'log', message: `> ⚠️ Agent requesting access to: ${routerDecision.tool_needed.toUpperCase()}` });
        writeEvent({ type: 'tool_permission', tool: routerDecision.tool_needed, compressed_prompt: routerDecision.compressed_prompt, target_model: routerDecision.target_model });
        return res.end();
      }
      
      finalTargetModel = routerDecision.target_model;
      finalPrompt = routerDecision.compressed_prompt;
    }

    // --- PHASE 3: MAIN EXECUTION ---
    writeEvent({ type: 'log', message: `> Establishing secure execution tunnel to ${finalTargetModel}...` });

    const bedrockResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BEDROCK_API_KEY!,
        'openai-project': process.env.BEDROCK_WORKSPACE_ID!
      },
      body: JSON.stringify({
        model: finalTargetModel,
        messages: [{ role: 'user', content: finalPrompt }],
        max_tokens: 4000,
        stream: true
      })
    });

    if (!bedrockResponse.ok) {
      const errorText = await bedrockResponse.text();
      throw new Error(`Execution Engine Error [HTTP ${bedrockResponse.status}]: ${errorText}`);
    }

    let fullAiResponse = '';
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
              if (chunk) { fullAiResponse += chunk; writeEvent({ type: 'token', text: chunk }); }
            } catch (e) {}
          }
        }
      }
    }

    // --- PHASE 4: LEDGER ---
    if (history_enabled) {
      let targetConvId = conversation_id;
      if (!targetConvId) {
        const { data: newConv } = await supabaseAdmin.from('conversations').insert({ user_id: user.id, title: prompt.substring(0, 40) }).select().single();
        targetConvId = newConv?.id;
      }
      if (targetConvId) {
        await supabaseAdmin.from('messages').insert([
          { conversation_id: targetConvId, role: 'user', content: prompt },
          { conversation_id: targetConvId, role: 'assistant', content: fullAiResponse }
        ]);
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
