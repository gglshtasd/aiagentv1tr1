import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (msg: string) => { res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`); if ((res as any).flush) (res as any).flush(); };
  const sendToken = (text: string) => { res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`); if ((res as any).flush) (res as any).flush(); };
  const closeStream = () => { res.write(`data: [DONE]\n\n`); res.end(); };

  try {
    const { prompt, mode, incognito, conversation_id } = req.body;
    
    // 1. AUTHENTICATION & LEDGER
    sendLog(`> [AUTH] Validating secure JWT for mode: ${mode}...`);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error("Unauthorized Access - Missing Token");

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized Access - Invalid Session");
    
    sendLog(`> [AUTH] Session verified for user: ${user.id}`);
    if (incognito) sendLog(`> [SYSTEM] 🕶️ INCOGNITO ACTIVE. Database writes suspended.`);

    const { data: wallet } = await supabase.from('users_wallet').select('is_blocked').eq('user_id', user.id).single();
    if (wallet?.is_blocked) throw new Error("Wallet Blocked - Insufficient Wallet Capacity");

    // 2. PRIMARY ROUTING ENGINE
    let targetModel = "";
    switch (mode) {
      case 'budget': targetModel = "google.gemma-3-4b-it"; break;
      case 'info': targetModel = "google.gemma-3-12b-it"; break;
      case 'workspace': targetModel = "google.gemma-3-27b-it"; break;
      case 'dev': targetModel = "qwen.qwen3-coder-30b-a3b-instruct"; break;
      case 'task': targetModel = "zai.glm-4.7-flash"; break;
      case 'architect': targetModel = "custom.architect-mode"; break;
      default: targetModel = "google.gemma-3-4b-it";
    }

    sendLog(`> [ROUTER] Primary Target Compute: [${targetModel}]`);

   // 3. EXECUTION ENGINE
    let llmResponse: Response | null = null;
    const awsRegion = process.env.AWS_REGION || 'us-east-1';

    // --- AGENT INTERCEPTOR (TASK MODE) ---
    if (mode === 'task') {
      sendLog(`> [SYSTEM] Initializing AWS Lambda SmolAgents Sandbox...`);
      const lambdaUrl = process.env.AWS_LAMBDA_AGENT_URL;
      
      if (!lambdaUrl) throw new Error("AWS_LAMBDA_AGENT_URL missing in environment.");

      const agentRes = await fetch(lambdaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context: "Execute safely." })
      });

      const agentData = await agentRes.json();
      
      if (!agentData.success) {
        sendLog(`> [LAMBDA CRASH] ${agentData.error}`);
        throw new Error("Agent Sandbox execution failed.");
      }

      // Stream the internal Python execution logs to the frontend telemetry panel
      const pythonLogs = agentData.telemetry.split('\n');
      for (const log of pythonLogs) {
        if (log.trim()) sendLog(`> [SMOLAGENTS] ${log}`);
      }

      // Stream the final answer to the chat canvas
      sendLog(`> [SYSTEM] Agent task complete. Rendering output.`);
      const answerTokens = agentData.answer.split(' ');
      for (const token of answerTokens) {
        sendToken(token + ' ');
        await new Promise(r => setTimeout(r, 20)); // slight delay for smooth typing effect
      }
      
      closeStream();
      return;
    }
    // --- END AGENT INTERCEPTOR ---

    // STANDARD AWS MANTLE HEADERS (For all other modes)
    const directAwsHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BEDROCK_API_KEY}`,
      'OpenAI-Project': process.env.BEDROCK_WORKSPACE_ID!
    };
    
    // ... [Rest of the existing ATTEMPT 1 and ATTEMPT 2 logic remains the same] ...

    // ATTEMPT 1: Azure VM LiteLLM Tunnel
    try {
      const proxyUrl = process.env.LITELLM_PROXY_URL;
      if (!proxyUrl || proxyUrl.includes('127.0.0.1')) throw new Error("Azure VM URL missing or local.");
      
      sendLog(`> [NETWORK] Opening secure inference tunnel to Azure VM...`);
      llmResponse = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LITELLM_MASTER_KEY}`
        },
        body: JSON.stringify({ model: targetModel, messages: [{ role: 'user', content: prompt }], stream: true })
      });
      
      if (!llmResponse.ok) throw new Error(`HTTP ${llmResponse.status}`);
      
    } catch (proxyError: any) {
      
      // ATTEMPT 2: FAIL-SAFE & AUTO-ROUTER
      sendLog(`> [NETWORK WARNING] Azure Tunnel Failed. Initiating Direct AWS Fallback...`);
      let fallbackModel = targetModel;

      // Micro-Orchestrator: Auto Model Selection (Skip for task/architect)
      if (mode !== 'task' && mode !== 'architect') {
        sendLog(`> [ROUTER] Running Micro-Orchestrator for AWS fallback auto-selection...`);
        try {
          const classRes = await fetch(`https://bedrock-mantle.${awsRegion}.api.aws/v1/chat/completions`, {
            method: 'POST',
            headers: directAwsHeaders,
            body: JSON.stringify({
              model: 'google.gemma-3-4b-it',
              messages: [{ role: 'user', content: `Classify this prompt as either strictly 'CODE' or strictly 'TEXT'. Output exactly one word. Prompt: ${prompt}` }],
              temperature: 0.1
            })
          });
          
          const classData = await classRes.json();
          const rawContent = (classData.choices?.[0]?.message?.content || '').toUpperCase();
          
          // Route based on dynamic context
          fallbackModel = rawContent.includes('CODE') ? 'qwen.qwen3-coder-30b-a3b-instruct' : 'google.gemma-3-12b-it';
          sendLog(`> [ROUTER] Auto-Routed Fallback to: [${fallbackModel}]`);
        } catch (err) {
          sendLog(`> [ROUTER] Classification timeout. Defaulting to [${fallbackModel}]`);
        }
      }

      // Execute Direct AWS Fallback
      llmResponse = await fetch(`https://bedrock-mantle.${awsRegion}.api.aws/v1/chat/completions`, {
        method: 'POST',
        headers: directAwsHeaders,
        body: JSON.stringify({ 
          model: fallbackModel, 
          messages: [{ role: 'user', content: prompt }], 
          max_tokens: 4000, 
          temperature: 0.7, 
          stream: true 
        })
      });

      if (!llmResponse.ok) throw new Error(`AWS Direct Engine Error: ${llmResponse.statusText}`);
      sendLog(`> [NETWORK] AWS Direct Connection Established.`);
    }

    // 4. STREAM PROCESSING
    const reader = llmResponse.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) throw new Error("Stream initialization failed");

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
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) sendToken(content);
        } catch (e) {
          // Ignore malformed chunks
        }
      }
    }

    sendLog(`> [SYSTEM] Inference sequence complete. Connection closed.`);
    closeStream();

  } catch (error: any) {
    sendLog(`> [FATAL EXCEPTION] ${error.message}`);
    closeStream();
  }
}
