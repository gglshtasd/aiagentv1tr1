// src/pages/api/git.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { classifyTierRequest } from '../../lib/tier-classifier';
import { getSupabaseClient } from '../../lib/supabase';
import type { APIResponse } from '../../types/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<APIResponse<any>>
) {
  if (req.method !== 'POST') return res.status(405).end();

  const userId = req.headers['x-user-id'] as string;
  const { prompt, repo, issue_number } = req.body;

  try {
    const classification = await classifyTierRequest({
      prompt,
      user_id: userId,
      requested_tier: 'GIT'
    });

    // Fire the GitHub Action workflow dispatch
    const githubRes = await fetch(`https://api.github.com/repos/${process.env.GITHUB_WORKFLOW_REPO}/actions/workflows/ai-agent.yml/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${process.env.GITHUB_PAT}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          prompt: prompt,
          target_repo: repo,
          issue: issue_number
        }
      })
    });

    if (!githubRes.ok) throw new Error("GitHub Actions dispatch failed");

    // Log the async task
    const supabase = getSupabaseClient();
    await supabase.from('admin_requests').insert({
      user_id: userId,
      request_id: classification.request_id,
      tier: 'GIT',
      model: classification.model,
      input_tokens: classification.estimated_tokens,
      status: 'dispatched',
    });

    return res.status(200).json({
      success: true,
      data: { status: "Workflow dispatched. PR will be opened shortly." },
      requestId: classification.request_id,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      requestId: 'error',
      timestamp: new Date().toISOString()
    });
  }
}
