import { createClient } from '@supabase/supabase-js';

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
    // 1. Profile Extraction (Personal Workspace Mode)
    let userProfile = "";
    if (mode === 'workspace' && !isIncognito) {
       const { data: profileData } = await supabaseAdmin.from('users').select('developer_profile').eq('id', userId).single();
       userProfile = profileData?.developer_profile ? JSON.stringify(profileData.developer_profile) : "";
    }

    // 2. Query Model Registry & Apply Architecture Routing Policy
    const { data: models } = await supabaseAdmin.from('model_registry').select('*').eq('is_available', true);
    
    let targetModel = 'google.gemma-3-4b-it'; // Failsafe fallback
    let workflow = 'standard';

    if (models && models.length > 0) {
      targetModel = models[0].model_id; // Default to first available
    }

    // Apply the 6 Mode Routing Policies
    switch(mode) {
      case 'info':
        workflow = 'web-scraping';
        targetModel = models?.find(m => m.tier === 'high' || m.tier === 'search')?.model_id || 'google.gemma-3-12b-it';
        break;
      case 'budget':
        workflow = 'thrift-compression'; 
        targetModel = models?.find(m => m.tier === 'low' || m.tier === 'free')?.model_id || 'google.gemma-3-4b-it';
        break;
      case 'workspace':
        workflow = 'profile-injected'; 
        targetModel = models?.find(m => m.tier === 'premium')?.model_id || 'google.gemma-3-27b-it';
        break;
      case 'dev':
        workflow = 'dev-studio'; 
        targetModel = models?.find(m => m.model_id.toLowerCase().includes('coder'))?.model_id || 'qwen.qwen3-coder-30b-a3b-instruct';
        break;
      case 'task':
        workflow = 'action-guild'; 
        targetModel = models?.find(m => m.model_id.toLowerCase().includes('glm') || m.model_id.toLowerCase().includes('claude'))?.model_id || 'zai.glm-4.7-flash';
        break;
      case 'architect':
        workflow = 'git-orchestrator'; 
        targetModel = 'custom.architect-mode'; 
        break;
    }

    return {
      success: true,
      payload: { userId, mode, model: targetModel, workflow, injectedContext: userProfile, isIncognito }
    };

  } catch (error: any) {
    console.error("[ORCHESTRATOR FATAL]", error.message);
    return { success: false, error: error.message };
  }
}
