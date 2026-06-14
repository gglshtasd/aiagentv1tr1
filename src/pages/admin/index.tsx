import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '../../lib/supabase-client'; 

// Strict TypeScript Interfaces for Vercel Compiler
interface User {
  id: string;
  email: string;
  role: string;
  current_spend_inr: number;
  monthly_credit_limit_inr: number;
  permissions?: Record<number, boolean>;
}

interface Log {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
}

interface PermissionRecord {
  user_id: string;
  tier_level: number;
  is_enabled: boolean;
}

export default function AdminPanel() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: usersData, error: usersErr } = await supabaseClient
        .from('users')
        .select('id, email, role, current_spend_inr, monthly_credit_limit_inr');
      
      if (usersErr) throw usersErr;

      const { data: permData, error: permErr } = await supabaseClient
        .from('user_tier_permissions')
        .select('*');

      if (permErr) throw permErr;

      // Strictly typed mapping to prevent Vercel Build Exit Code 1
      const mappedUsers = (usersData as User[]).map((u: User) => {
        const userPerms: Record<number, boolean> = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false };
        
        (permData as PermissionRecord[])
          .filter((p) => p.user_id === u.id)
          .forEach((p) => { userPerms[p.tier_level] = p.is_enabled; });

        return { ...u, permissions: userPerms };
      });

      setUsers(mappedUsers);

      const { data: logsData, error: logsErr } = await supabaseClient
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsErr) throw logsErr;
      setLogs(logsData as Log[] || []);

    } catch (err) {
      const e = err as Error;
      console.error("Admin Fetch Error:", e);
      setError(e.message || "Failed to load admin data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCreditLimit = async (userId: string, newLimit: number) => {
    try {
      const { error } = await supabaseClient
        .from('users')
        .update({ monthly_credit_limit_inr: newLimit })
        .eq('id', userId);
      
      if (error) throw error;
      setUsers(users.map(u => u.id === userId ? { ...u, monthly_credit_limit_inr: newLimit } : u));
    } catch (err) {
      console.error(err);
      alert("Failed to update credit limit. Check console.");
    }
  };

  const handleToggleTier = async (userId: string, tier: number, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      const { error } = await supabaseClient
        .from('user_tier_permissions')
        .upsert({ user_id: userId, tier_level: tier, is_enabled: newVal }, { onConflict: 'user_id,tier_level' });
      
      if (error) throw error;
      
      setUsers(users.map(u => {
        if (u.id === userId && u.permissions) {
          return { ...u, permissions: { ...u.permissions, [tier]: newVal } };
        }
        return u;
      }));
    } catch (err) {
      console.error(err);
      alert(`Failed to update Tier ${tier}. Check console.`);
    }
  };

  const handleLogout = async () => {
    try {
      await supabaseClient.auth.signOut();
      router.push('/login');
    } catch (err) {
      console.error("Logout Error:", err);
    }
  };

  if (isLoading) return <div className="p-10 text-white bg-gray-900 min-h-screen">Loading Orchestrator Data...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-6 font-mono">
      <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">Master AI Orchestrator</h1>
          <p className="text-sm text-gray-500">System Administration & Telemetry</p>
        </div>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-200 rounded transition-colors text-sm">
          [ TERMINATE_SESSION ]
        </button>
      </header>

      {error && <div className="bg-red-900/50 text-red-200 p-3 rounded mb-6 border border-red-800">{error}</div>}

      <div className="flex gap-4 mb-6">
        <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded ${activeTab === 'users' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800' : 'bg-gray-900 hover:bg-gray-800'}`}>Access & Billing Limits</button>
        <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded ${activeTab === 'logs' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800' : 'bg-gray-900 hover:bg-gray-800'}`}>System Logs</button>
      </div>

      {activeTab === 'users' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-950 border-b border-gray-800">
              <tr><th className="p-4">User Email</th><th className="p-4">Spend (INR)</th><th className="p-4">Monthly Limit (INR)</th><th className="p-4">Tier Access Routing (T1 - T6)</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="p-4 text-gray-300">{u.email} <span className="text-xs text-gray-600 block">{u.role}</span></td>
                  <td className="p-4 font-mono text-emerald-400">₹{u.current_spend_inr || 0}</td>
                  <td className="p-4">
                    <input type="number" defaultValue={u.monthly_credit_limit_inr} onBlur={(e) => handleUpdateCreditLimit(u.id, Number(e.target.value))} className="bg-gray-950 border border-gray-700 rounded px-2 py-1 w-24 text-white focus:border-emerald-500 outline-none" />
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5, 6].map(tier => (
                        <label key={tier} className="flex flex-col items-center cursor-pointer group">
                          <span className="text-xs text-gray-500 mb-1">T{tier}</span>
                          <input type="checkbox" checked={u.permissions?.[tier] || false} onChange={() => handleToggleTier(u.id, tier, u.permissions?.[tier] || false)} className="accent-emerald-500 w-4 h-4 cursor-pointer" />
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-black border border-gray-800 rounded-lg p-4 font-mono text-xs overflow-y-auto max-h-[70vh]">
          {logs.length === 0 ? <p className="text-gray-600">No telemetry data available.</p> : null}
          {logs.map(log => (
            <div key={log.id} className="mb-2 pb-2 border-b border-gray-900 flex gap-4">
              <span className="text-gray-600 w-40 shrink-0">{new Date(log.created_at).toLocaleString()}</span>
              <span className={`w-16 shrink-0 font-bold ${log.level === 'error' ? 'text-red-500' : log.level === 'warn' ? 'text-yellow-500' : 'text-blue-400'}`}>[{log.level.toUpperCase()}]</span>
              <span className="text-purple-400 w-24 shrink-0">{log.source}</span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
