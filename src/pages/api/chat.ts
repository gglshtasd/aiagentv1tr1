import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with Service Role to bypass RLS for backend verifications
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Initialize Server-Sent Events (SSE) Stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (msg: string) => { res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`); if ((res as any).flush) (res as any).flush(); };
  const sendToken = (text: string) => { res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`); if ((res as any).flush) (res as any).flush(); };
  const closeStream = () => { res.write(`data: [DONE]\n\n`); res.end(); };

  try {
    const { prompt, mode, incognito, conversation_id } = req.body;
    
    // 1. AUTHENTICATION MIDDLEWARE
    sendLog(`> [AUTH] Validating secure JWT for mode: ${mode}...`);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error("Unauthorized Access - Missing Token");
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) throw new Error("Unauthorized Access - Invalid Session");
    sendLog(`> [AUTH] Session verified for user: ${user.id}`);

    if (incognito) sendLog(`> [SYSTEM] 🕶️ INCOGNITO ACTIVE. Database writes suspended.`);

    // 2. WALLET & BILLING INTERCEPTOR (Bypass for now if auto-provisioning)
    const { data: wallet } = await supabase.from('users_wallet').select('is_blocked').eq('user_id', user.id).single();
    if (wallet?.is_blocked) throw new Error("Wallet Blocked - Insufficient Wallet Capacity");

    // 3. 5-MODE ROUTING ENGINE (Using your exact working model IDs)
    let targetModel = "";
    let workflow = "";

    switch (mode) {
      case 'budget':
        targetModel = "google.gemma-3-4b-it";
        workflow = "thrift-compression";
        break;
      case 'info':
        targetModel = "google.gemma-3-12b-it";
        workflow = "web-browse-worker";
        break;
      case 'workspace':
        targetModel = "google.gemma-3-27b-it";
        workflow = "standard-engineering";
        break;
      case 'dev':
        targetModel = "qwen.qwen3-coder-30b-a3b-instruct";
        workflow = "code-centric";
        break;
      case 'task':
        targetModel = "zai.glm-4.7-flash";
        workflow = "smolagents-lambda-trigger";
        break;
      case 'architect':
        targetModel = "custom.architect-mode";
        workflow = "unrestricted-override";
        break;
      default:
        targetModel = "google.gemma-3-4b-it";
        workflow = "fallback";
    }

    sendLog(`> [ROUTER] Assigned Workflow: ${workflow}`);
    sendLog(`> [ROUTER] Target Compute: [${targetModel}]`);

    // --- EXECUTION ENGINE ---
    let llmResponse: Response | null = null;
    let usingFallback = false;

    // ATTEMPT 1: Azure VM LiteLLM Tunnel
    try {
      const proxyUrl = process.env.LITELLM_PROXY_URL;
      if (proxyUrl && !proxyUrl.includes('127.0.0.1')) {
        sendLog(`> [NETWORK] Opening secure inference tunnel to Azure VM: ${proxyUrl}...`);
        llmResponse = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LITELLM_MASTER_KEY}`
          },
          body: JSON.stringify({ model: targetModel, messages: [{ role: 'user', content: prompt }], stream: true })
        });
        
        if (!llmResponse.ok) throw new Error(`HTTP ${llmResponse.status}`);
      } else {
        throw new Error("Azure VM URL not configured correctly.");
      }
    } catch (proxyError: any) {
      // ATTEMPT 2: Fail-safe Direct AWS Bedrock Mantle Connection
      sendLog(`> [NETWORK WARNING] Azure VM Tunnel Failed: ${proxyError.message}`);
      sendLog(`> [NETWORK] Triggering Fail-safe: Direct AWS Bedrock Mantle Connection...`);
      usingFallback = true;
      
      const region = process.env.AWS_REGION || 'us-east-1';
      llmResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'x-api-key': process.env.BEDROCK_API_KEY!, 
          'openai-project': process.env.BEDROCK_WORKSPACE_ID! 
        },
        body: JSON.stringify({ 
          model: targetModel, 
          messages: [{ role: 'user', content: prompt }], 
          max_tokens: 4000, 
          temperature: 0.7, 
          stream: true 
        })
      });

      if (!llmResponse.ok) throw new Error(`AWS Direct Engine Error: ${llmResponse.statusText}`);
      sendLog(`> [NETWORK] AWS Direct Connection Established.`);
    }

    if (!llmResponse) throw new Error("All inference routes failed.");

    // --- STREAM PROCESSING ---
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
          // Handle standard OpenAI-compatible chunk format
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) sendToken(content);
        } catch (e) {
          // Ignore malformed JSON chunks
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
