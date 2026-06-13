import { useState, useEffect } from 'react';
import { supabaseClient } from '../../lib/supabase-client';

export default function SuperAdminPanel() {
  const [models, setModels] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'MODELS' | 'USERS'>('MODELS');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: mData } = await supabaseClient.from('model_registry').select('*').order('tier');
    const { data: uData } = await supabaseClient.from('profiles').select('*');
    if (mData) setModels(mData);
    if (uData) setUsers(uData);
  };

  // Manual Override: Flip a model's availability
  const toggleModelStatus = async (modelId: string, currentStatus: boolean) => {
    await supabaseClient.from('model_registry').update({ is_available: !currentStatus }).eq('model_id', modelId);
    fetchData();
  };

  // Run the 1-Token Background Audit
  const runGlobalAudit = async () => {
    setIsTesting(true);
    try {
      await fetch('/api/admin/test-models', { method: 'POST' });
      await fetchData(); 
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };
// Inside Admin Panel state:
const [inviteKeys, setInviteKeys] = useState<any[]>([]);

const generateNewKey = async () => {
  // Inserts a new uuid directly into invite_codes
  const { data, error } = await supabaseClient.from('invite_codes').insert({}).select().single();
  if (data) setInviteKeys([data, ...inviteKeys]);
};

// ... Inside the return statement, add the Keys Tab UI:
{activeTab === 'KEYS' && (
  <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-xl font-bold">Access Invite Keys</h2>
      <button onClick={generateNewKey} className="bg-green-600 text-white px-4 py-2 rounded font-bold">
        + Generate New Key
      </button>
    </div>
    
    <div className="space-y-2">
      {inviteKeys.map(k => (
        <div key={k.code} className="flex justify-between p-3 bg-gray-900 rounded font-mono text-sm border border-gray-700">
          <span className="text-blue-400">{k.code}</span>
          <span className={k.is_active ? 'text-green-400' : 'text-red-400'}>
            {k.is_active ? 'VALID' : 'USED'}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
  // Adjust a user's credit limit
  const updateCreditLimit = async (userId: string, newLimit: number) => {
    await supabaseClient.from('profiles').update({ monthly_credit_limit_inr: newLimit }).eq('id', userId);
    alert('Limit Updated Successfully');
    fetchData();
  };

  // Toggle Advanced Mode for a user
  const toggleAdvancedMode = async (userId: string, currentStatus: boolean) => {
    await supabaseClient.from('profiles').update({ advanced_mode_enabled: !currentStatus }).eq('id', userId);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Gateway Control Plane</h1>
        
        <div className="flex gap-4 mb-8">
          <button onClick={() => setActiveTab('MODELS')} className={`px-4 py-2 rounded font-semibold ${activeTab === 'MODELS' ? 'bg-blue-600' : 'bg-gray-800'}`}>AI Provider Settings</button>
          <button onClick={() => setActiveTab('USERS')} className={`px-4 py-2 rounded font-semibold ${activeTab === 'USERS' ? 'bg-blue-600' : 'bg-gray-800'}`}>User Limits & Billing</button>
        </div>

        {activeTab === 'MODELS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Model Registry & Toggles</h2>
              <button onClick={runGlobalAudit} disabled={isTesting} className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white px-4 py-2 rounded text-sm font-bold transition-colors">
                {isTesting ? 'Running Ping Sweep...' : 'Run Automated Availability Audit'}
              </button>
            </div>
            
            <div className="space-y-3">
              {models.map(m => (
                <div key={m.model_id} className="flex justify-between items-center p-3 bg-gray-700/50 rounded">
                  <div>
                    <div className="font-bold">{m.friendly_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{m.model_id} • Tier: {m.tier.toUpperCase()}</div>
                    {m.failure_reason && <div className="text-xs text-red-400 mt-1">Error: {m.failure_reason}</div>}
                  </div>
                  <button onClick={() => toggleModelStatus(m.model_id, m.is_available)} className={`px-4 py-2 rounded font-bold text-xs w-28 ${m.is_available ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-900/80 hover:bg-red-800 text-red-200'}`}>
                    {m.is_available ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'USERS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-bold mb-6">User Financial Guardrails</h2>
            <div className="space-y-4">
              {users.map(u => (
                <div key={u.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-700/50 rounded gap-4">
                  <div>
                    <div className="font-bold">{u.email} <span className="text-xs bg-gray-600 px-2 py-1 rounded ml-2 uppercase">{u.role}</span></div>
                    <div className="text-sm mt-1">
                      Spend: <span className={u.current_spend_inr >= u.monthly_credit_limit_inr ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
                        ₹{u.current_spend_inr} / ₹{u.monthly_credit_limit_inr}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 items-center">
                    <button onClick={() => toggleAdvancedMode(u.id, u.advanced_mode_enabled)} className={`px-3 py-1 rounded text-xs font-bold ${u.advanced_mode_enabled ? 'bg-orange-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
                      {u.advanced_mode_enabled ? '★ ADVANCED MODE ON' : 'AUTO MODE ONLY'}
                    </button>
                    <div className="flex gap-2">
                      <input type="number" id={`limit-${u.id}`} defaultValue={u.monthly_credit_limit_inr} className="w-24 p-1 bg-gray-900 border border-gray-600 rounded text-center text-sm" />
                      <button onClick={() => { const val = parseFloat((document.getElementById(`limit-${u.id}`) as HTMLInputElement).value); updateCreditLimit(u.id, val); }} className="bg-blue-600 px-3 py-1 rounded text-xs font-bold hover:bg-blue-500">
                        SET LIMIT
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
