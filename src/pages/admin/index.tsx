import { generateTelemetryPayload } from '../../lib/telemetry';
import { useState, useEffect, useRef } from 'react';
import { supabaseClient } from '../../lib/supabase-client';

export default function SuperAdminPanel() {
  const [models, setModels] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [inviteKeys, setInviteKeys] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[] | null>(null); // Added for Audit Output
  
  const [activeTab, setActiveTab] = useState<'MODELS' | 'USERS' | 'KEYS' | 'ACTIVITY' | 'SYSTEM'>('MODELS');
  const [isTesting, setIsTesting] = useState(false);

  // --- MODEL STATE ---
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelTier, setNewModelTier] = useState('CHAT');

  // --- SYSTEM TEST STATE ---
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Add scrolling effect for System Terminal
  useEffect(() => { terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [testLogs]);

  useEffect(() => {
    fetchData();
    logDevicePresence();
  }, []);

  const logDevicePresence = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const payload = await generateTelemetryPayload();
      await fetch('/api/auth/log-device', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(payload)
      }).catch(console.error);
    }
  };

  const fetchData = async () => {
    const { data: mData } = await supabaseClient.from('model_registry').select('*').order('tier');
    const { data: uData } = await supabaseClient.from('users').select('*').order('created_at', { ascending: false });
    const { data: kData } = await supabaseClient.from('invite_codes').select('*').order('created_at', { ascending: false });
    const { data: lData } = await supabaseClient.from('login_activity').select('*').order('login_time', { ascending: false }).limit(50);
    
    if (mData) setModels(mData);
    if (uData) setUsers(uData);
    if (kData) setInviteKeys(kData);
    if (lData) setLogs(lData);
  };

  // --- SYSTEM TEST FUNCTIONS ---
  const runSystemTest = async (target: string) => {
    setTestLogs(prev => [...prev, `\n> [${new Date().toLocaleTimeString()}] Initiating test sequence: ${target.toUpperCase()}`]);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const res = await fetch('/api/admin/test-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ target })
      });
      
      const data = await res.json();
      setTestLogs(prev => [...prev, `> HTTP Status: ${res.status}`]);
      setTestLogs(prev => [...prev, `> Output:\n${JSON.stringify(data, null, 2)}`]);
    } catch (err: any) {
      setTestLogs(prev => [...prev, `> Error: ${err.message}`]);
    }
  };

  // --- MODEL FUNCTIONS ---
  const toggleModelStatus = async (modelId: string, currentStatus: boolean) => {
    await supabaseClient.from('model_registry').update({ is_available: !currentStatus }).eq('model_id', modelId);
    fetchData();
  };

  const runGlobalAudit = async () => {
    setIsTesting(true);
    setAuditLogs(null); // Clear previous results
    try {
      // dryRun=true ensures it just returns results without updating the DB
      const res = await fetch('/api/admin/test-models?dryRun=true', { method: 'POST' });
      const data = await res.json();
      setAuditLogs(data.results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  const addModel = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabaseClient.from('model_registry').insert({
      model_id: newModelId, friendly_name: newModelName, tier: newModelTier, is_available: false
    });
    if (error) alert('Failed to add model: ' + error.message);
    else {
      setNewModelId(''); setNewModelName(''); setNewModelTier('CHAT'); fetchData();
    }
  };

  // --- USER FUNCTIONS ---
  const updateCreditLimit = async (userId: string, newLimit: number) => {
    await supabaseClient.from('users').update({ monthly_credit_limit_inr: newLimit }).eq('id', userId);
    fetchData();
  };

  const toggleAdvancedMode = async (userId: string, currentStatus: boolean) => {
    await supabaseClient.from('users').update({ advanced_mode_enabled: !currentStatus }).eq('id', userId);
    fetchData();
  };

  // --- KEY FUNCTIONS ---
  const generateNewKey = async () => {
    const { data, error } = await supabaseClient.from('invite_codes').insert({}).select().single();
    if (data) setInviteKeys([data, ...inviteKeys]);
    else alert('Failed to generate key: ' + error?.message);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER WITH CHAT ROUTING */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Gateway Control Plane</h1>
          <button onClick={() => window.location.href = '/chat'} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold shadow transition-colors">
            Exit to Chat ➔
          </button>
        </div>
        
        <div className="flex flex-wrap gap-4 mb-8">
          <button onClick={() => setActiveTab('MODELS')} className={`px-4 py-2 rounded font-semibold transition-colors ${activeTab === 'MODELS' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>AI Registry</button>
          <button onClick={() => setActiveTab('USERS')} className={`px-4 py-2 rounded font-semibold transition-colors ${activeTab === 'USERS' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>Financial Limits</button>
          <button onClick={() => setActiveTab('KEYS')} className={`px-4 py-2 rounded font-semibold transition-colors ${activeTab === 'KEYS' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>Invite Keys</button>
          <button onClick={() => setActiveTab('ACTIVITY')} className={`px-4 py-2 rounded font-semibold transition-colors ${activeTab === 'ACTIVITY' ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'}`}>Telemetry</button>
          <button onClick={() => setActiveTab('SYSTEM')} className={`px-4 py-2 rounded font-semibold transition-colors ${activeTab === 'SYSTEM' ? 'bg-orange-600 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}>System Tests</button>
        </div>

        {/* 1. MODELS TAB */}
        {activeTab === 'MODELS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg">
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Model Registry & Toggles</h2>
              <button onClick={runGlobalAudit} disabled={isTesting} className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white px-4 py-2 rounded text-sm font-bold shadow transition-colors">
                {isTesting ? 'Running Sweep...' : 'Run Dry-Run Audit'}
              </button>
            </div>

            {/* AUDIT OUTPUT DISPLAY */}
            {auditLogs && (
              <div className="mb-6 p-4 bg-black border border-gray-700 rounded-lg max-h-64 overflow-y-auto font-mono text-xs">
                <div className="text-purple-400 mb-2 font-bold uppercase tracking-wider">--- Dry Run Results ---</div>
                {auditLogs.map((log: any, idx: number) => (
                  <div key={idx} className="mb-1">
                    <span className={log.status?.includes('ONLINE') ? 'text-green-400' : 'text-red-400'}>[{log.status}]</span>{' '}
                    <span className="text-white font-bold">{log.model_id}</span>{' '}
                    <span className="text-gray-500">- {log.error}</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={addModel} className="mb-6 p-4 bg-gray-900 rounded border border-gray-700 flex flex-wrap md:flex-nowrap gap-4 items-end shadow-inner">
              <div className="flex-1 w-full">
                <label className="block text-xs mb-1 text-gray-400">Model ID</label>
                <input value={newModelId} onChange={e => setNewModelId(e.target.value)} required className="w-full bg-gray-800 p-2 rounded text-sm border border-gray-600 focus:outline-none focus:border-blue-500" placeholder="e.g. anthropic.claude-3-haiku" />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs mb-1 text-gray-400">Friendly Name</label>
                <input value={newModelName} onChange={e => setNewModelName(e.target.value)} required className="w-full bg-gray-800 p-2 rounded text-sm border border-gray-600 focus:outline-none focus:border-blue-500" placeholder="e.g. Claude 3 Haiku" />
              </div>
              <div className="w-full md:w-auto">
                <label className="block text-xs mb-1 text-gray-400">Target Tier</label>
                <select value={newModelTier} onChange={e => setNewModelTier(e.target.value)} className="w-full bg-gray-800 p-2 rounded text-sm border border-gray-600 focus:outline-none">
                  <option value="CHAT">CHAT</option>
                  <option value="GIT">GIT</option>
                  <option value="SANDBOX">SANDBOX</option>
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="AUTO">AUTO</option>
                  <option value="ADVANCED">ADVANCED</option>
                  <option value="PREMIUM">PREMIUM</option>
                </select>
              </div>
              <button type="submit" className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-sm font-bold h-[38px] whitespace-nowrap w-full md:w-auto transition-colors">Add Model</button>
            </form>

            <div className="space-y-3">
              {models.map(m => (
                <div key={m.model_id} className="flex justify-between items-center p-3 bg-gray-700/50 rounded hover:bg-gray-700/80 transition-colors">
                  <div>
                    <div className="font-bold">{m.friendly_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{m.model_id} • Tier: <span className="text-blue-300">{m.tier.toUpperCase()}</span></div>
                  </div>
                  <button onClick={() => toggleModelStatus(m.model_id, m.is_available)} className={`px-4 py-2 rounded font-bold text-xs w-28 transition-colors ${m.is_available ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-red-900/80 text-red-200 hover:bg-red-800'}`}>
                    {m.is_available ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. USERS TAB */}
        {activeTab === 'USERS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg">
            <h2 className="text-xl font-bold mb-6">User Financial Guardrails</h2>
            <div className="space-y-4">
              {users.map(u => (
                <div key={u.id} className="flex flex-col md:flex-row justify-between p-4 bg-gray-700/50 rounded gap-4 hover:bg-gray-700/80 transition-colors">
                  <div>
                    <div className="font-bold">{u.email} <span className={`text-xs px-2 py-1 rounded ml-2 uppercase ${u.role === 'admin' ? 'bg-red-900/80 text-red-200' : 'bg-gray-600 text-gray-200'}`}>{u.role}</span></div>
                    <div className="text-sm mt-1 text-gray-400">Spend: <span className="font-bold text-green-400">₹{u.current_spend_inr} / ₹{u.monthly_credit_limit_inr}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <button onClick={() => toggleAdvancedMode(u.id, u.advanced_mode_enabled)} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${u.advanced_mode_enabled ? 'bg-orange-500 hover:bg-orange-400 text-white shadow' : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`}>
                      {u.advanced_mode_enabled ? '★ ADVANCED ON' : 'AUTO MODE ONLY'}
                    </button>
                    <div className="flex gap-2 bg-gray-900 p-1 rounded border border-gray-600">
                      <input type="number" id={`limit-${u.id}`} defaultValue={u.monthly_credit_limit_inr} className="w-24 p-1 bg-transparent text-center text-sm focus:outline-none" />
                      <button onClick={() => { const val = parseFloat((document.getElementById(`limit-${u.id}`) as HTMLInputElement).value); updateCreditLimit(u.id, val); }} className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-xs font-bold transition-colors">SET LIMIT</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. KEYS TAB */}
        {activeTab === 'KEYS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Access Invite Keys</h2>
              <button onClick={generateNewKey} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow transition-colors">
                + Generate UUID Key
              </button>
            </div>
            <div className="space-y-2">
              {inviteKeys.map(k => (
                <div key={k.code} className="flex justify-between items-center p-3 bg-gray-900 rounded font-mono text-sm border border-gray-700">
                  <span className="text-blue-400 select-all">{k.code}</span>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${k.is_active ? 'bg-green-900/50 text-green-400 border border-green-800' : 'bg-red-900/50 text-red-400 border border-red-800'}`}>
                    {k.is_active ? 'VALID' : 'BURNED'}
                  </span>
                </div>
              ))}
              {inviteKeys.length === 0 && <div className="text-gray-500 text-sm italic">No invite keys generated yet.</div>}
            </div>
          </div>
        )}

        {/* 4. ACTIVITY TAB */}
        {activeTab === 'ACTIVITY' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg overflow-x-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                📡 Deep Telemetry & Fraud Watch
              </h2>
              <button onClick={fetchData} className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors">🔄 Refresh</button>
            </div>
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="text-xs text-gray-500 uppercase bg-gray-900 border-b border-gray-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time & Account</th>
                  <th className="px-4 py-3 font-semibold">Network Origin</th>
                  <th className="px-4 py-3 font-semibold">Hardware Profile (GPU)</th>
                  <th className="px-4 py-3 font-semibold">Canvas Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-700/50 transition-colors">
                    
                    {/* Time & Account */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-white font-bold">{log.email}</div>
                      <div className="text-xs text-gray-500">{new Date(log.login_time).toLocaleString()}</div>
                    </td>

                    {/* Network Origin */}
                    <td className="px-4 py-3">
                      <div className="text-blue-400 font-bold">{log.location || 'Local/Proxy'}</div>
                      <div className="text-xs font-mono text-gray-500">{log.ip_address}</div>
                    </td>

                    {/* Hardware Profile */}
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-300 font-mono truncate max-w-[200px]" title={log.gpu_model}>
                        {log.gpu_model || 'Hidden Render Engine'}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className="bg-gray-700 text-[10px] px-1.5 py-0.5 rounded text-gray-300 border border-gray-600">
                          {log.cpu_cores || '?'} Cores
                        </span>
                        <span className="bg-gray-700 text-[10px] px-1.5 py-0.5 rounded text-gray-300 border border-gray-600">
                          {log.ram_gb || '?'}GB RAM
                        </span>
                      </div>
                    </td>

                    {/* Fingerprint */}
                    <td className="px-4 py-3">
                       <span className="bg-purple-900/40 text-purple-400 font-mono text-xs px-2 py-1 rounded border border-purple-800/50">
                         {log.canvas_hash || 'no-hash'}
                       </span>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <div className="p-4 text-center text-gray-500 text-sm italic border-t border-gray-700">Awaiting incoming connection data...</div>}
          </div>
        )}

        {/* 5. SYSTEM TAB */}
        {activeTab === 'SYSTEM' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/3 flex flex-col gap-3">
              <h2 className="text-xl font-bold mb-2 border-b border-gray-700 pb-2">Diagnostic Triggers</h2>
              <button onClick={() => runSystemTest('lambda')} className="bg-gray-700 hover:bg-gray-600 text-left px-4 py-3 rounded border border-gray-600 transition-colors">
                <div className="font-bold text-orange-400">Test AWS Lambda</div>
                <div className="text-xs text-gray-400">Pings serverless scraping functions</div>
              </button>
              <button onClick={() => runSystemTest('codebuild')} className="bg-gray-700 hover:bg-gray-600 text-left px-4 py-3 rounded border border-gray-600 transition-colors">
                <div className="font-bold text-blue-400">Test AWS CodeBuild</div>
                <div className="text-xs text-gray-400">Validates sandbox container spin-up</div>
              </button>
              <button onClick={() => runSystemTest('github')} className="bg-gray-700 hover:bg-gray-600 text-left px-4 py-3 rounded border border-gray-600 transition-colors">
                <div className="font-bold text-white">Test GitHub Actions</div>
                <div className="text-xs text-gray-400">Dispatches dummy workflow payload</div>
              </button>
              <button onClick={() => runSystemTest('llm')} className="bg-gray-700 hover:bg-gray-600 text-left px-4 py-3 rounded border border-gray-600 transition-colors">
                <div className="font-bold text-green-400">Test LLM Orchestrator</div>
                <div className="text-xs text-gray-400">Validates proxy routing & payload</div>
              </button>
              <button onClick={() => setTestLogs([])} className="mt-4 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest text-center py-2">
                Clear Logs
              </button>
            </div>
            
            {/* Admin Terminal Box */}
            <div className="w-full md:w-2/3 bg-black rounded-lg border border-gray-700 p-4 font-mono text-xs overflow-y-auto h-[500px] shadow-inner text-green-400">
              <div className="text-gray-500 mb-4 pb-2 border-b border-gray-800 uppercase tracking-widest">Diagnostic Output Terminal</div>
              {testLogs.map((log, idx) => (
                <div key={idx} className="mb-2 whitespace-pre-wrap break-words">{log}</div>
              ))}
              <div ref={terminalEndRef} />
              {testLogs.length === 0 && <div className="text-gray-600 italic">Waiting for diagnostic trigger...</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
