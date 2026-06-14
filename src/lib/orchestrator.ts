import { createClient } from '@supabase/supabase-js';

// Setup internal Admin client for secure routing decisions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) } }
);

export async function logSystemEvent(level: string, source: string, message: string) {
  try {
    await supabaseAdmin.from('system_logs').insert({ level, source, message });
  } catch (e) {
    console.error("Telemetry failure:", e);
  }
}

export async function orchestrateRequest(userId: string, prompt: string, mode: string, isIncognito: boolean = false) {
  try {
    // 1. Profile Extraction (For Personal Workspace Mode)
    let userProfile = "";
    if (mode === 'workspace' && !isIncognito) {
       const { data: profileData } = await supabaseAdmin.from('users').select('developer_profile').eq('id', userId).single();
       userProfile = profileData?.developer_profile ? JSON.stringify(profileData.developer_profile) : "";
    }

    // 2. The 6-Mode Routing Matrix
    let targetModel = '';
    let workflow = 'standard';

    switch(mode) {
      case 'info':
        targetModel = 'google.gemma-3-12b-it';
        workflow = 'web-scraping'; // Will trigger Puppeteer lambda in Phase 4
        break;
      case 'budget':
        targetModel = 'google.gemma-3-4b-it';
        workflow = 'thrift-compression'; 
        break;
      case 'workspace':
        targetModel = 'google.gemma-3-27b-it';
        workflow = 'profile-injected'; 
        break;
      case 'dev':
        targetModel = 'qwen.qwen3-coder-30b-a3b-instruct'; // Default dev model
        workflow = 'dev-studio'; 
        break;
      case 'task':
        targetModel = 'zai.glm-4.7-flash';
        workflow = 'action-guild'; // Triggers smolagents
        break;
      case 'architect':
        targetModel = 'custom.architect-mode'; // Unrestricted
        workflow = 'git-orchestrator'; 
        break;
      default:
        targetModel = 'google.gemma-3-4b-it';
        workflow = 'standard';
    }

    return {
      success: true,
      payload: { userId, mode, model: targetModel, workflow, injectedContext: userProfile, isIncognito }
    };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "System Exception";
    console.error("[ORCHESTRATOR FATAL]", errorMsg);
    return { success: false, error: errorMsg };
  }
}
