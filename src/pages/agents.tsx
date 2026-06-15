import { useState } from 'react';
import { supabase } from '../lib/supabase-client';

export default function AgentGateway() {
  const [prompt, setPrompt] = useState('');
  const [tier, setTier] = useState<'CHAT' | 'GIT' | 'SANDBOX'>('CHAT');
  const [repo, setRepo] = useState(''); // Specific to GIT tier
  
  const [classification, setClassification] = useState<any>(null);
  const [executionResult, setExecutionResult] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'ESTIMATING' | 'READY' | 'EXECUTING'>('IDLE');

  // Phase 1: Pre-flight Classifier
  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('ESTIMATING');
    
    // Changed 'supabaseClient' to 'supabase'
    const { data: { session } } = await supabase.auth.getSession();
    
    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({
          prompt,
          user_id: session?.user?.id,
          requested_tier: tier
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setClassification(data.data);
        setStatus('READY');
      } else alert(data.error);
    } catch (err) {
      setStatus('IDLE');
    }
  };

  // Phase 2: Execution Routing
  const handleExecute = async () => {
    setStatus('EXECUTING');
    // Changed 'supabaseClient' to 'supabase'
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    let endpoint = '/api/chat';
    let payload: any = { prompt, modelId: classification.model };

    if (tier === 'GIT') {
      endpoint = '/api/git';
      payload = { prompt, repo };
    } else if (tier === 'SANDBOX') {
      endpoint = '/api/sandbox';
      payload = { prompt };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (tier === 'CHAT') setExecutionResult(data.text);
      else setExecutionResult(JSON.stringify(data.data, null, 2)); // Show workflow/node status
      
    } catch (err) {
      setExecutionResult('Execution Failed.');
    } finally {
      setStatus('IDLE');
      setClassification(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Unified Agent Gateway</h1>
      
      <form onSubmit={handleEstimate} className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
        
        {/* Tier Selection */}
        <div className="flex gap-4 mb-4">
          {(['CHAT', 'GIT', 'SANDBOX'] as const).map((t) => (
            <label key={t} className={`flex-1 p-4 border rounded cursor-pointer transition-all ${tier === t ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'bg-white hover:bg-gray-50'}`}>
              <input type="radio" name="tier" className="hidden" checked={tier === t} onChange={() => { setTier(t); setClassification(null); setStatus('IDLE'); }} />
              <div className="font-bold">{t} Tier</div>
              <div className="text-xs text-gray-500 mt-1">
                {t === 'CHAT' ? 'Standard QA & Text' : t === 'GIT' ? 'GitHub PR Automation' : 'Live E2E Ubuntu VM'}
              </div>
            </label>
          ))}
        </div>

        {/* Tier-Specific Inputs */}
        {tier === 'GIT' && (
          <div>
            <label className="block text-sm font-medium mb-1">Target Repository</label>
            <input type="text" value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/repo" className="w-full p-2 border rounded" required />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Agent Directive (Prompt)</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full p-3 border rounded h-32" required />
        </div>

        <button type="submit" disabled={status !== 'IDLE'} className="w-full bg-gray-800 text-white py-2 rounded hover:bg-gray-900 disabled:opacity-50">
          {status === 'ESTIMATING' ? 'Analyzing Cost...' : 'Calculate Token Cost'}
        </button>
      </form>

      {/* Pre-Flight Preview & Execution */}
      {status === 'READY' && classification && (
        <div className="bg-blue-900 text-white p-6 rounded-lg shadow-lg">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">✓ Pre-Flight Checks Passed</h3>
          <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
            <div><span className="text-blue-300 block">Assigned Model</span>{classification.model}</div>
            <div><span className="text-blue-300 block">Est. Tokens</span>~{classification.estimated_tokens}</div>
            <div><span className="text-blue-300 block">Est. Cost</span>${classification.estimated_cost}</div>
          </div>
          <button onClick={handleExecute} className="w-full bg-green-500 hover:bg-green-400 text-gray-900 font-bold py-3 rounded text-lg">
            Confirm & Execute Agent
          </button>
        </div>
      )}

      {/* Results Output */}
      {status === 'EXECUTING' && <div className="text-center text-blue-600 font-medium py-8 animate-pulse">Agent is executing your directive...</div>}
      
      {executionResult && status !== 'EXECUTING' && (
        <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm whitespace-pre-wrap overflow-x-auto">
          {executionResult}
        </div>
      )}
    </div>
  );
}
