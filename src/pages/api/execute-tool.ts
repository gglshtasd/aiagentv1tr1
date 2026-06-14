import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import { logSystemEvent } from '../../lib/orchestrator';

// Initialize core clients
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const region = process.env.AWS_REGION || 'us-east-1';

// Initialize AWS Clients using your Vercel Environment Variables
const lambda = new LambdaClient({ 
  region, 
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } 
});
const codebuild = new CodeBuildClient({ 
  region, 
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } 
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { tool, compressed_prompt, target_model } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    // 1. Verify User Session
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    // 2. Generate Executable Code via the Orchestrated Model
    // We force the AI to return raw code based on the user's compressed prompt.
    const bedrockResponse = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BEDROCK_API_KEY!, 'openai-project': process.env.BEDROCK_WORKSPACE_ID! },
      body: JSON.stringify({
        model: target_model || 'qwen.qwen3-coder-30b-a3b-instruct',
        messages: [{ 
          role: 'user', 
          content: `Write strictly working ${tool === 'lambda' ? 'Python 3 code' : 'Ubuntu Bash commands'} to accomplish this task: ${compressed_prompt}. Do not use markdown blocks, explanations, or code fences. Output ONLY the raw executable code.` 
        }],
        temperature: 0.1,
        max_tokens: 1500
      })
    });

    const bedrockData = await bedrockResponse.json();
    const generatedCode = bedrockData.choices?.[0]?.message?.content?.trim() || '';
    
    let executionLogs = '';
    let charged_inr = 0;

    // 3. Route to specific AWS Resource based on Tool
    if (tool === 'lambda') {
      charged_inr = 5.00; // Flat fee for Python Sandbox run
      
      const command = new InvokeCommand({
        FunctionName: 'ai-agent-sandbox',
        Payload: Buffer.from(JSON.stringify({ code: generatedCode }))
      });
      
      const response = await lambda.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      
      executionLogs = result.error ? `[ERROR]\n${result.error}` : result.logs || 'Execution finished silently (no print statements).';
      
    } else if (tool === 'codebuild' || tool === 'github_actions') {
      charged_inr = 15.00; // Flat fee for Heavy Git Compute Environment
      
      const command = new StartBuildCommand({
        projectName: 'ai-git-orchestrator',
        environmentVariablesOverride: [
          { name: 'TARGET_REPO', value: 'github.com/your-username/your-repo.git', type: 'PLAINTEXT' }, // Update dynamically as needed
          { name: 'AI_COMMANDS', value: generatedCode, type: 'PLAINTEXT' }
        ]
      });
      
      const response = await codebuild.send(command);
      executionLogs = `> Cloud Build Job Triggered successfully.\n> Build ARN: ${response.build?.arn}\n> Track live progress in AWS Console.`;
      
    } else {
      throw new Error(`Unknown or unauthorized tool requested: ${tool}`);
    }

    // 4. Enterprise Ledger Deduction
    const { data: userData } = await supabaseAdmin.from('users').select('current_spend_inr').eq('id', user.id).single();
    await supabaseAdmin.from('users').update({ current_spend_inr: (userData?.current_spend_inr || 0) + charged_inr }).eq('id', user.id);
    await supabaseAdmin.from('billing_ledger').insert([{ user_id: user.id, service_type: `agent_${tool}`, amount_inr: charged_inr, description: `Automated Agent Execution: ${tool}` }]);
    
    // 5. System Logging
    logSystemEvent('info', 'aws_compute', `User ${user.id} triggered ${tool}. Billed ₹${charged_inr}`);

    return res.status(200).json({ success: true, logs: executionLogs, charged_inr });

  } catch (error: any) {
    logSystemEvent('error', 'aws_compute', `Tool execution failure: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}
