import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import { executeAgentTool } from '../../lib/lambda-invoker';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const codebuild = new CodeBuildClient({ region: process.env.AWS_REGION || 'us-east-1' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { tool, compressed_prompt, target_model } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    let executionLogs = '';
    let finalCostUsd = 0;

    // --- FETCH MARGIN & PRICING ---
    const { data: pricing } = await supabaseAdmin
      .from('system_pricing')
      .select('*')
      .eq('service_name', `tool_${tool}`)
      .single();
      
    const baseCost = pricing?.base_cost_usd || 0.01;
    const margin = pricing?.margin_multiplier || 1.60;

    // ==========================================
    // TOOL ROUTER
    // ==========================================
    if (tool === 'codebuild') {
      const startCommand = new StartBuildCommand({
        projectName: 'AI_Agent_Sandbox', 
        environmentVariablesOverride: [
          { name: 'AI_INSTRUCTION', value: compressed_prompt, type: 'PLAINTEXT' }
        ]
      });
      
      await codebuild.send(startCommand);
      executionLogs = `AWS CodeBuild instance spun up successfully.\nExecuting container task for prompt: "${compressed_prompt.substring(0, 50)}..."`;
      finalCostUsd = baseCost * margin;

    } else if (tool === 'github_actions') {
      const ghRes = await fetch(`https://api.github.com/repos/${process.env.GITHUB_WORKFLOW_REPO || 'owner/repo'}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${process.env.GITHUB_PAT}`
        },
        body: JSON.stringify({ event_type: "agent_trigger", client_payload: { instruction: compressed_prompt } })
      });
      
      if (!ghRes.ok) throw new Error("GitHub API rejected the action.");
      executionLogs = `GitHub Action Dispatch successful. Runner is picking up the job.`;
      finalCostUsd = baseCost * margin;

    } else if (tool === 'lambda') {
      // BUG FIX: Added Missing Lambda Execution Logic
      const lambdaRes = await executeAgentTool('analyze', { instruction: compressed_prompt });
      executionLogs = `AWS Lambda Execution successful.\nResult: ${JSON.stringify(lambdaRes)}`;
      finalCostUsd = baseCost * margin;

    } else {
      throw new Error(`Tool [${tool}] is not recognized by the Gateway.`);
    }

    // ==========================================
    // LEDGER COMMIT (The Margin Charge)
    // ==========================================
    const finalCostInr = finalCostUsd * 83; // USD to INR conversion

    await supabaseAdmin.from('billing_ledger').insert({
      user_id: user.id,
      service_type: `TOOL_${tool.toUpperCase()}`,
      amount_inr: finalCostInr,
      description: `Automated Execution: ${tool}. Base: $${baseCost.toFixed(4)}, Margin: ${((margin-1)*100)}%`
    });

    return res.status(200).json({ 
      success: true, 
      logs: executionLogs,
      charged_inr: finalCostInr 
    });

  } catch (error: any) {
    console.error("Execution Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
