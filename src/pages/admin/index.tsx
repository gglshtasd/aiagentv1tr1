import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../../lib/supabase-client';

interface InviteCode { id: string; code: string; max_uses: number; times_used: number; is_active: boolean; created_at: string; }
interface SystemLog { id: string; level: string; source: string; message: string; created_at: string; }

export default function MasterAdminHub() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [invitesRes, logsRes] = await Promise.all([
        fetch('/api/admin/invites', { cache: 'no-store' }),
        fetch('/api/admin/logs', { cache: 'no-store' })
      ]);
      if (invitesRes.ok) setInvites(await invitesRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
    } catch (err) { console.error("Failed to fetch admin data", err); } finally { setLoading(false); }
  };

  const generateInvite = async (uses: number) => {
    try {
      const res = await fetch('/api/admin/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ max_uses: uses }) });
      if (res.ok) fetchData();
    } catch (err) { alert('Failed to generate invite'); }
  };

  const toggleInvite = async (id: string, currentState: boolean) => {
    try {
      const res = await fetch('/api/admin/invites', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !currentState }) });
      if (res.ok) fetchData();
    } catch (err) { alert('Failed to toggle invite'); }
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } 
    catch (e) { console.error(e); } 
    finally { window.location.replace('/login'); }
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-green-400 font-mono p-8 flex items-center justify-center">INITIALIZING SECURE UPLINK...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 font-mono p-8 selection:bg-green-900 selection:text-green-100">
      <Head><title>Master Orchestrator | Command Center</title></Head>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section with New Buttons */}
        <header className="border-b border-green-900/50 pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-green-500 tracking-tighter">[ SYSTEM_ADMIN_HUB ]</h1>
            <p className="text-sm text-gray-500 mt-2">v3.0 Multi-Agent Orchestration & Network Access Control</p>
          </div>
          <div className="flex gap-3">
            <Link href="/chat" className="px-4 py-2 bg-blue-900/20 text-blue-400 border border-blue-800 rounded hover:bg-blue-900/40 transition-all text-sm shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              → Workspace
            </Link>
            <Link href="/admin/billing" className="px-4 py-2 bg-green-900/20 text-green-400 border border-green-800 rounded hover:bg-green-900/40 transition-all text-sm shadow-[0_0_15px_rgba(34,197,94,0.1)]">
              → Ledger
            </Link>
            <button onClick={handleLogout} className="px-4 py-2 bg-red-900/20 text-red-400 border border-red-800 rounded hover:bg-red-900/40 transition-all text-sm shadow-[0_0_15px_rgba(239,68,68,0.1)]">
              Logout
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Invite System */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span> Access Keys
              </h2>
              
              <div className="flex gap-2 mb-6">
                <button onClick={() => generateInvite(1)} className="flex-1 bg-blue-900/20 text-blue-400 border border-blue-800 rounded py-2 text-xs hover:bg-blue-900/40 transition-colors">Generate (1-Use)</button>
                <button onClick={() => generateInvite(5)} className="flex-1 bg-purple-900/20 text-purple-400 border border-purple-800 rounded py-2 text-xs hover:bg-purple-900/40 transition-colors">Generate (5-Use)</button>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {invites.map(inv => (
                  <div key={inv.id} className="p-3 bg-gray-950 border border-gray-800 rounded flex justify-between items-center group hover:border-gray-600 transition-colors">
                    <div>
                      <div className="text-white font-bold tracking-widest text-xs truncate w-32">{inv.code}</div>
                      <div className="text-[10px] text-gray-500 mt-1">Uses: {inv.times_used} / {inv.max_uses}</div>
                    </div>
                    <button onClick={() => toggleInvite(inv.id, inv.is_active)} className={`text-[10px] px-2 py-1 rounded border ${inv.is_active ? 'bg-green-900/20 text-green-400 border-green-800' : 'bg-red-900/20 text-red-400 border-red-800'}`}>
                      {inv.is_active ? 'ACTIVE' : 'REVOKED'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Telemetry Feed */}
          <div className="lg:col-span-2">
            <div className="bg-black border border-gray-800 rounded-lg p-6 shadow-2xl h-full">
               <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span> Raw Telemetry Sink</h2>
              <div className="bg-gray-950 border border-gray-900 rounded p-4 h-[600px] overflow-y-auto font-mono text-xs space-y-2">
                {logs.length === 0 ? (
                  <div className="text-gray-600 italic">Waiting for incoming telemetry...</div>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className="flex gap-4 border-b border-gray-900 pb-2 hover:bg-gray-900/50 p-1">
                      <span className="text-gray-600 whitespace-nowrap">[{new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false })}]</span>
                      <span className={`w-16 font-bold ${log.level === 'error' || log.level === 'fatal' ? 'text-red-500' : log.level === 'warn' ? 'text-yellow-500' : 'text-blue-500'}`}>{log.level.toUpperCase()}</span>
                      <span className="text-gray-500 w-24 truncate">[{log.source}]</span>
                      <span className="text-gray-300">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
