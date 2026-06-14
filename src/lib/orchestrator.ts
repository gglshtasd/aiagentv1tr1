import { authorizeCompute } from './billing'; // Assuming billing.ts is in the same dir
import { createClient } from '@supabase/supabase-js';

// Setup internal Admin client for secure routing decisions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) } }
);

export async function orchestrateRequest(
  userId: string, 
  prompt: string, 
  tier: number,
  isIncognito: boolean = false
) {
  try {
    // 1. Enterprise Billing Gate
    // Requires a minimum of ₹0.50 available to initiate any compute
    const { authorized, reason } = await authorizeCompute(userId, 0.50); 
    if (!authorized) {
       throw new Error(`[BILLING GATE] ${reason}`);
    }

    // 2. Profile Extraction (For Tier 3 Personal Workspace)
    let userProfile = "";
    if (tier === 3 && !isIncognito) {
       const { data: profileData } = await supabaseAdmin
         .from('users')
         .select('developer_profile')
         .eq('id', userId)
         .single();
       userProfile = profileData?.developer_profile ? JSON.stringify(profileData.developer_profile) : "";
    }

    // 3. The 6-Tier Routing Matrix
    let targetModel = '';
    let workflow = 'standard';

    switch(tier) {
      case 1:
        targetModel = 'google.gemma-3-12b-it';
        workflow = 'web-scraping'; // Requires Puppeteer/Lambda trigger
        break;
      case 2:
        targetModel = 'google.gemma-3-4b-it';
        workflow = 'thrift-compression'; // Forces summary-buffer
        break;
      case 3:
        targetModel = 'google.gemma-3-27b-it';
        workflow = 'profile-injected'; 
        break;
      case 4:
        // Defaults to 30B, user can toggle to 480B in UI
        targetModel = 'qwen.coder-30b';
        workflow = 'dev-studio'; 
        break;
      case 5:
        targetModel = 'glm.4-7-flash';
        workflow = 'action-guild'; // Triggers AWS Lambda / smolagents
        break;
      case 6:
        targetModel = 'custom.architect-mode';
        workflow = 'git-orchestrator'; // Triggers AWS CodeBuild
        break;
      default:
        targetModel = 'google.gemma-3-4b-it';
        workflow = 'standard';
    }

    return {
      success: true,
      payload: {
        userId,
        tier,
        model: targetModel,
        workflow,
        injectedContext: userProfile,
        isIncognito
      }
    };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "System Exception";
    console.error("[ORCHESTRATOR FATAL]", errorMsg);
    return { success: false, error: errorMsg };
  }
}
