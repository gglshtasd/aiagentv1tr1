import { useState, useEffect } from 'react';
import { supabaseClient } from '../../lib/supabase-client';

export default function SuperAdminPanel() {
  const [models, setModels] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [inviteKeys, setInviteKeys] = useState<any[]>([]);
  
  // FIX: We added 'KEYS' to the allowed TypeScript union here
  const [activeTab, setActiveTab] = useState<'MODELS' | 'USERS' | 'KEYS'>('MODELS');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: mData } = await supabaseClient.from('model_registry').select('*').order('tier');
    const { data: uData } = await supabaseClient.from('profiles').select('*');
    const { data: kData } = await supabaseClient.from('invite_codes').select('*').order('created_at', { ascending: false });
    
    if (mData) setModels(mData);
    if (uData) setUsers(uData);
    if (kData) setInviteKeys(kData);
  };

  const toggleModelStatus = async (modelId: string, currentStatus: boolean) => {
    await supabaseClient.from('model_registry').update({ is_available: !currentStatus }).eq('model_id', modelId);
    fetchData();
  };

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

  const updateCreditLimit = async (userId: string, newLimit: number) => {
    await supabaseClient.from('profiles').update({ monthly_credit_limit_inr: newLimit }).eq('id', userId);
    alert('Limit Updated Successfully');
    fetchData();
  };

  const toggleAdvancedMode = async (userId: string, currentStatus: boolean) => {
    await supabaseClient.from('profiles').update({ advanced_mode_enabled: !currentStatus }).eq('id', userId);
    fetchData();
  };

  const generateNewKey = async () => {
    const { data, error } = await supabaseClient.from('invite_codes').insert({}).select().single();
    if (data) {
      setInviteKeys([data, ...inviteKeys]);
    } else {
      alert('Failed to generate key');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Gateway Control Plane</h1>
        
        <div className="flex gap-4 mb-8">
          <button onClick={() => setActiveTab('MODELS')} className={`px-4 py-2 rounded font-semibold ${activeTab === 'MODELS' ? 'bg-blue-600' : 'bg-gray-800'}`}>AI Provider Settings</button>
          <button onClick={() => setActiveTab('USERS')} className={`px-4 py-2 rounded font-semibold ${activeTab === 'USERS' ? 'bg-blue-600' : 'bg-gray-800'}`}>User Limits & Billing</button>
          <button onClick={() => setActiveTab('KEYS')} className={`px-4 py-2 rounded font-semibold ${activeTab === 'KEYS' ? 'bg-blue-600' : 'bg-gray-800'}`}>Invite Keys</button>
        </div>

        {/* MODELS TAB */}
        {activeTab === 'MODELS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Model Registry & Toggles</h2>
              <button onClick={runGlobalAudit} disabled={isTesting} className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white px-4 py-2 rounded text-sm font-bold">
                {isTesting ? 'Running Sweep...' : 'Run Availability Audit'}
              </button>
            </div>
            <div className="space-y-3">
              {models.map(m => (
                <div key={m.model_id} className="flex justify-between items-center p-3 bg-gray-700/50 rounded">
                  <div>
                    <div className="font-bold">{m.friendly_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{m.model_id} • Tier: {m.tier.toUpperCase()}</div>
                  </div>
                  <button onClick={() => toggleModelStatus(m.model_id, m.is_available)} className={`px-4 py-2 rounded font-bold text-xs w-28 ${m.is_available ? 'bg-green-600 text-white' : 'bg-red-900/80 text-red-200'}`}>
                    {m.is_available ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'USERS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-bold mb-6">User Financial Guardrails</h2>
            <div className="space-y-4">
              {users.map(u => (
                <div key={u.id} className="flex flex-col md:flex-row justify-between p-4 bg-gray-700/50 rounded gap-4">
                  <div>
                    <div className="font-bold">{u.email} <span className="text-xs bg-gray-600 px-2 py-1 rounded ml-2 uppercase">{u.role}</span></div>
                    <div className="text-sm mt-1">Spend: <span className="font-bold text-green-400">₹{u.current_spend_inr} / ₹{u.monthly_credit_limit_inr}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <button onClick={() => toggleAdvancedMode(u.id, u.advanced_mode_enabled)} className={`px-3 py-1 rounded text-xs font-bold ${u.advanced_mode_enabled ? 'bg-orange-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
                      {u.advanced_mode_enabled ? '★ ADVANCED ON' : 'AUTO MODE ONLY'}
                    </button>
                    <div className="flex gap-2">
                      <input type="number" id={`limit-${u.id}`} defaultValue={u.monthly_credit_limit_inr} className="w-24 p-1 bg-gray-900 border border-gray-600 rounded text-center text-sm" />
                      <button onClick={() => { const val = parseFloat((document.getElementById(`limit-${u.id}`) as HTMLInputElement).value); updateCreditLimit(u.id, val); }} className="bg-blue-600 px-3 py-1 rounded text-xs font-bold">SET LIMIT</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KEYS TAB */}
        {activeTab === 'KEYS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Access Invite Keys</h2>
              <button onClick={generateNewKey} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold">
                + Generate New Key
              </button>
            </div>
            <div className="space-y-2">
              {inviteKeys.map(k => (
                <div key={k.code} className="flex justify-between p-3 bg-gray-900 rounded font-mono text-sm border border-gray-700">
                  <span className="text-blue-400">{k.code}</span>
                  <span className={k.is_active ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    {k.is_active ? 'VALID' : 'USED'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
