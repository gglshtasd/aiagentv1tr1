import { useState, useEffect } from 'react';
import { supabaseClient } from '../../lib/supabase-client';

interface ModelRegistry {
  model_id: string;
  friendly_name: string;
  tier: string;
  is_available: boolean;
  last_tested_at: string;
  failure_reason: string | null;
}

export default function AdminDashboard() {
  const [models, setModels] = useState<ModelRegistry[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);

  const fetchModels = async () => {
    const { data } = await supabaseClient.from('model_registry').select('*').order('tier');
    if (data) setModels(data);
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const runGlobalAudit = async () => {
    setIsTesting(true);
    setTestResults(null);
    try {
      // Calls the diagnostic API we created earlier
      const res = await fetch('/api/admin/test-models', { method: 'POST' });
      const data = await res.json();
      setTestResults(data);
      await fetchModels(); // Refresh table with new statuses
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 tracking-tight">System Control Plane</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-2">Active Gateways</h3>
            <p className="text-3xl font-semibold text-green-400">
              {models.filter(m => m.is_available).length} / {models.length}
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-2">Cost Multiplier Target</h3>
            <p className="text-3xl font-semibold text-blue-400">1.5x</p>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Model Availability Registry</h2>
            <button 
              onClick={runGlobalAudit}
              disabled={isTesting}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded transition-colors flex items-center gap-2"
            >
              {isTesting ? 'Running Ping Sweep...' : 'Run Global Availability Audit'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-sm text-gray-400">
                  <th className="p-3">Model ID</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Last Ping</th>
                  <th className="p-3">Diagnostics</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.model_id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                    <td className="p-3 font-mono text-sm">{m.model_id}</td>
                    <td className="p-3">
                      <span className="bg-gray-700 px-2 py-1 rounded text-xs uppercase">{m.tier}</span>
                    </td>
                    <td className="p-3">
                      {m.is_available ? (
                        <span className="text-green-400 flex items-center gap-2">● Verified</span>
                      ) : (
                        <span className="text-red-400 flex items-center gap-2">● Offline</span>
                      )}
                    </td>
                    <td className="p-3 text-sm text-gray-400">
                      {new Date(m.last_tested_at).toLocaleTimeString()}
                    </td>
                    <td className="p-3 text-xs text-red-300 max-w-xs truncate" title={m.failure_reason || ''}>
                      {m.failure_reason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
