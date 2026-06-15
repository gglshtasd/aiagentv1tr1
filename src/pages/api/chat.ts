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

  const sendLog = (msg: string) => res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`);
  const sendToken = (text: string) => res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`);
  const closeStream = () => { res.write(`data: [DONE]\n\n`); res.end(); };

  try {
    const { prompt, mode, incognito, conversation_id } = req.body;
    
    // 1. AUTHENTICATION MIDDLEWARE
    sendLog(`> [AUTH] Validating secure JWT for mode: ${mode}...`);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error("Unauthorized Access - Missing or Malformed Token");
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error(`Unauthorized Access - ${authError?.message || 'Invalid Session'}`);
    }
    sendLog(`> [AUTH] Session verified for user: ${user.id}`);

    // 2. WALLET & BILLING INTERCEPTOR
    sendLog(`> [LEDGER] Querying state ledger for wallet status...`);
    const { data: wallet, error: walletError } = await supabase
      .from('users_wallet')
      .select('balance_inr, monthly_credit_limit_inr, is_blocked')
      .eq('user_id', user.id)
      .single();

    // Auto-provision a wallet if it doesn't exist (helpful for early deployment)
    if (!wallet) {
      sendLog(`> [LEDGER] No wallet found. Auto-provisioning default credits...`);
      await supabase.from('users_wallet').insert({ user_id: user.id, balance_inr: 0, monthly_credit_limit_inr: 500.00 });
    } else if (wallet.is_blocked) {
      throw new Error("Wallet Blocked - Insufficient Wallet Capacity");
    }

    // 3. 5-MODE ROUTING ENGINE
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
        targetModel = "google.gemma-27b-it";
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
    if (incognito) sendLog(`> [SYSTEM] 🕶️ INCOGNITO ACTIVE. Database writes suspended.`);

    // 4. LITELLM PROXY NETWORK TUNNEL
    const proxyUrl = process.env.LITELLM_PROXY_URL;
    const proxyKey = process.env.LITELLM_MASTER_KEY;

    if (!proxyUrl || proxyUrl.includes('127.0.0.1') || proxyUrl.includes('localhost')) {
      throw new Error(`Misconfigured LITELLM_PROXY_URL. Currently set to: ${proxyUrl}. Must be the Azure VM Public IP.`);
    }

    sendLog(`> [NETWORK] Opening secure inference tunnel to: ${proxyUrl}/v1/chat/completions`);

    const llmResponse = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${proxyKey}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    });

    if (!llmResponse.ok) {
      throw new Error(`LiteLLM Proxy rejected connection: HTTP ${llmResponse.status}`);
    }

    // 5. STREAM PROCESSING
    const reader = llmResponse.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) throw new Error("Stream initialization failed");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.replace('data: ', ''));
            const content = parsed.choices[0]?.delta?.content;
            if (content) sendToken(content);
          } catch (e) {
            // Ignore malformed JSON chunks from raw stream
          }
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
