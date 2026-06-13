'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '../lib/supabase-client';

export default function ChatInterface() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [tier, setTier] = useState('CHAT');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // NEW STATE: Dynamic Model Selection
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');

  // 1. Initial Auth Check
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login';
      } else {
        setUser(session.user);
      }
    });
  }, []);

  // 2. Fetch Allowed Models whenever the User or Tier changes
  useEffect(() => {
    if (!user) return;
    
    const fetchModels = async () => {
      const { data, error } = await supabaseClient
        .from('user_model_access')
        .select('model_name')
        .eq('user_id', user.id)
        .eq('tier', tier)
        .eq('enabled', true);
      
      if (data && data.length > 0) {
        const models = data.map(d => d.model_name);
        setAvailableModels(models);
        setSelectedModel(models[0]); // Auto-select the first one
      } else {
        setAvailableModels([]);
        setSelectedModel('');
      }
    };
    
    fetchModels();
  }, [user, tier]);

  const handleTestGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModel) {
      setResponse('Error: No active model selected for this tier.');
      return;
    }

    setLoading(true);
    setResponse(`Routing request to ${selectedModel}...`);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          prompt, 
          modelId: selectedModel // Pass the dynamically selected model
        })
      });

      const data = await res.json();
      
      if (data.success) {
        setResponse(`[Bedrock Response via ${selectedModel}]\n\n${data.text}\n\n[Token Usage: Input ${data.usage.input_tokens} | Output ${data.usage.output_tokens}]`);
      } else {
        setResponse(`Execution Error: ${data.error}`);
      }
      
    } catch (error: any) {
      setResponse(`System Error: ${error.message}`);
    }
    
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = '/login';
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p className="animate-pulse">Establishing secure connection...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-white font-sans">
      <header className="flex justify-between items-center p-4 bg-gray-800 border-b border-gray-700">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Serditone Gateway Terminal</h1>
          <p className="text-xs text-green-400">Connected: {user.email}</p>
        </div>
        <button onClick={handleLogout} className="text-sm bg-red-600 hover:bg-red-700 px-4 py-2 rounded transition-colors">
          Disconnect
        </button>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Controls Panel */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">1. Select Tier</h2>
            <div className="space-y-2 mb-6">
              {['CHAT', 'GIT', 'SANDBOX'].map((t) => (
                <label key={t} className={`flex items-center p-3 rounded cursor-pointer border transition-all ${tier === t ? 'bg-blue-900 border-blue-500' : 'border-gray-600 hover:bg-gray-700'}`}>
                  <input type="radio" name="tier" value={t} checked={tier === t} onChange={(e) => setTier(e.target.value)} className="hidden" />
                  <span className="font-medium">{t}</span>
                </label>
              ))}
            </div>

            {/* NEW: Dynamic Model Dropdown */}
            <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">2. Select Target Model</h2>
            {availableModels.length > 0 ? (
              <select 
                value={selectedModel} 
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-2.5"
              >
                {availableModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-800">
                No active models authorized for this tier.
              </p>
            )}
          </div>
        </div>

        {/* Input/Output Panel */}
        <div className="md:col-span-2 space-y-4 flex flex-col">
          <form onSubmit={handleTestGateway} className="flex flex-col gap-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter prompt vector here..."
              className="w-full h-32 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white resize-none"
              required
            />
            <button
              type="submit"
              disabled={loading || !prompt || !selectedModel}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center"
            >
              {loading ? 'Executing on Bedrock...' : 'Execute Prompt'}
            </button>
          </form>

          <div className="flex-1 bg-black rounded-lg border border-gray-700 p-4 overflow-auto min-h-[300px]">
            <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-2">System Output</h3>
            <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
              {response || 'Awaiting input...'}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
