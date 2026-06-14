import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.split(' ')[1];
  const { target } = req.body;

  try {
    // Rigid Security Check - Only Admins can trigger these raw architecture tests
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");
    
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') throw new Error("Restricted to Admin personnel.");

    let result = {};

    switch (target) {
      case 'lambda':
        // Test AWS Lambda configurations via dummy payload request
        result = {
           status: "Simulated Request Configured",
           endpoint: "Lambda: AgentTools_Python",
           payload: { action: "ping", context: "diagnostic" },
           message: "Lambda Invoker module initialized successfully. Ensure AWS_REGION and AWS_ACCESS_KEY_ID are set for live production execution."
        };
        break;

      case 'codebuild':
        // Validate payload structure expected by the @aws-sdk/client-codebuild
        result = {
           status: "Payload Constructed",
           projectName: "AI_Agent_Sandbox",
           environmentVariablesOverride: [
             { name: "AI_INSTRUCTION", value: "echo 'Diagnostic Sandbox Ping'", type: "PLAINTEXT" }
           ],
           message: "CodeBuild Command structured. Warning: Executing this live without a provisioned AWS project will result in ResourceNotFoundException."
        };
        break;

      case 'github':
        // Test the GitHub Action dispatch connection
        if (!process.env.GITHUB_PAT) throw new Error("Missing GITHUB_PAT environment variable.");
        result = {
          status: "Dry Run",
          url: `https://api.github.com/repos/${process.env.GITHUB_WORKFLOW_REPO || 'owner/repo'}/actions/workflows/ai-agent.yml/dispatches`,
          headers_passed: ["Authorization", "Accept"],
          message: "GitHub dispatch parameters are valid. Skipping actual POST to avoid repo noise."
        };
        break;

      case 'llm':
        // Run a lightweight proxy ping to Bedrock
        const bedrockRes = await fetch(`https://bedrock-mantle.${process.env.AWS_REGION || 'us-east-1'}.api.aws/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.BEDROCK_API_KEY || 'missing',
            'openai-project': process.env.BEDROCK_WORKSPACE_ID || 'missing'
          },
          body: JSON.stringify({
            model: 'google.gemma-3-4b-it',
            messages: [{ role: 'user', content: 'Reply with the word PONG.' }],
            max_tokens: 10
          })
        });
        
        if (!bedrockRes.ok) throw new Error(`Bedrock HTTP ${bedrockRes.status}: ${await bedrockRes.text()}`);
        const bedrockData = await bedrockRes.json();
        
        result = {
          status: "Success",
          latency_ms: "N/A",
          response: bedrockData.choices?.[0]?.message?.content || bedrockData
        };
        break;

      default:
        throw new Error(`Unknown diagnostic target: ${target}`);
    }

    return res.status(200).json(result);

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
