import { useState, useEffect } from 'react';
import { supabaseClient } from '../../lib/supabase-client';

export default function SuperAdminPanel() {
  const [models, setModels] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'MODELS' | 'USERS'>('MODELS');

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

  // Adjust a user's credit limit
  const updateCreditLimit = async (userId: string, newLimit: number) => {
    await supabaseClient.from('profiles').update({ monthly_credit_limit_inr: newLimit }).eq('id', userId);
    alert('Limit Updated Successfully');
    fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Gateway Control Plane</h1>
        
        <div className="flex gap-4 mb-8">
          <button onClick={() => setActiveTab('MODELS')} className={`px-4 py-2 rounded ${activeTab === 'MODELS' ? 'bg-blue-600' : 'bg-gray-800'}`}>AI Provider Settings</button>
          <button onClick={() => setActiveTab('USERS')} className={`px-4 py-2 rounded ${activeTab === 'USERS' ? 'bg-blue-600' : 'bg-gray-800'}`}>User Limits & Billing</button>
        </div>

        {activeTab === 'MODELS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl mb-4">Manual Model Toggles</h2>
            <div className="space-y-3">
              {models.map(m => (
                <div key={m.model_id} className="flex justify-between items-center p-3 bg-gray-700/50 rounded">
                  <div>
                    <div className="font-bold">{m.friendly_name}</div>
                    <div className="text-xs text-gray-400">{m.model_id} • Tier: {m.tier}</div>
                  </div>
                  <button 
                    onClick={() => toggleModelStatus(m.model_id, m.is_available)}
                    className={`px-4 py-1 rounded font-bold text-sm ${m.is_available ? 'bg-green-600 text-white' : 'bg-red-600/50 text-red-200'}`}
                  >
                    {m.is_available ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'USERS' && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl mb-4">User Financial Guardrails</h2>
            <div className="space-y-4">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-4 bg-gray-700/50 rounded">
                  <div>
                    <div className="font-mono text-sm mb-1">{u.id}</div>
                    <div className="text-sm">
                      Spend: <span className={u.current_spend_inr >= u.monthly_credit_limit_inr ? 'text-red-400' : 'text-green-400'}>
                        ₹{u.current_spend_inr} / ₹{u.monthly_credit_limit_inr}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="number" id={`limit-${u.id}`} defaultValue={u.monthly_credit_limit_inr} className="w-24 p-1 bg-gray-900 border border-gray-600 rounded text-center" />
                    <button 
                      onClick={() => {
                        const val = parseFloat((document.getElementById(`limit-${u.id}`) as HTMLInputElement).value);
                        updateCreditLimit(u.id, val);
                      }}
                      className="bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-500"
                    >
                      Set Limit
                    </button>
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
