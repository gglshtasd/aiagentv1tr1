import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase-client';
import MarkdownRenderer from '../components/MarkdownRenderer';

interface Message { role: 'user' | 'assistant'; content: string; }
interface HistoryItem { id: string; title: string; }

export default function PremiumChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('budget');
  const [incognito, setIncognito] = useState(false);
  const [loading, setLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<string[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const telemetryEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionToken(session.access_token);
        // Fetch User Chat History
        const { data } = await supabase.from('conversations').select('id, title').eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (data) setHistory(data);
      } else {
        window.location.replace('/login');
      }
    };
    initializeAuth();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { telemetryEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [telemetry]);

  const addLog = (msg: string) => setTelemetry(prev => [...prev, msg]);

  const loadConversation = async (id: string) => {
    setConvId(id);
    const { data } = await supabase.from('messages').select('role, content').eq('conversation_id', id).order('created_at', { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } 
    catch (e) { console.error(e); } 
    finally { window.location.replace('/login'); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionToken) return;
    
    const userPrompt = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ prompt: userPrompt, mode, incognito, conversation_id: convId })
      });

      // CRITICAL FIX: Explicitly handle server/network crashes
      if (!res.ok) {
         const errorText = await res.text();
         addLog(`> [NETWORK ERROR] Server returned HTTP ${res.status}: ${errorText}`);
         throw new Error(`HTTP ${res.status}`);
      }

      if (!res.body) throw new Error('No readable stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        
        for (const line of lines) {
          const dataStr = line.replace('data: ', '').trim();
          if (dataStr === '[DONE]') break;
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'token') {
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content += data.text;
                return newMsgs;
              });
            } else if (data.type === 'log') {
              addLog(data.message);
            } else if (data.type === 'conversation_id') {
              setConvId(data.id);
            }
          } catch (e) {}
        }
      }
    } catch (e: any) {
      addLog(`> [FATAL] Sequence aborted: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0e1117] text-gray-200 font-sans">
      <Head><title>Orchestrator Workspace</title></Head>

      {/* LEFT SIDEBAR: History */}
      <div className="w-64 bg-[#161b22] border-r border-gray-800 flex flex-col hidden md:flex">
        <div className="p-4 font-bold tracking-wider text-sm border-b border-gray-800 text-gray-400">WORKSPACE</div>
        <div className="p-4 flex-1 overflow-y-auto space-y-2 custom-scrollbar">
          <button onClick={() => { setConvId(null); setMessages([]); }} className="w-full text-left p-2 rounded bg-blue-900/20 hover:bg-blue-900/40 border border-blue-900 text-sm transition-colors text-blue-400 mb-4">
            + New Chat Session
          </button>
          {history.map(h => (
             <button key={h.id} onClick={() => loadConversation(h.id)} className="w-full text-left p-2 rounded bg-gray-800/30 hover:bg-gray-800 border border-gray-800 text-xs text-gray-300 truncate transition-colors">
               {h.title}
             </button>
          ))}
        </div>
      </div>

      {/* CENTER: Main Chat Interface */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
        <header className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-[#161b22]/50">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="bg-[#0d1117] border border-gray-700 rounded px-3 py-1.5 text-sm font-medium focus:outline-none">
            <option value="budget">Budget Mode (Gemma 4B)</option>
            <option value="info">Web Search Mode (Gemma 12B)</option>
            <option value="workspace">Workspace Mode (Gemma 27B)</option>
            <option value="dev">Dev Studio (Qwen Coder)</option>
            <option value="task">Agent Mode (GLM + Python)</option>
            <option value="architect">Architect Mode (Unrestricted)</option>
          </select>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
               <span className="text-xs text-gray-500 font-mono tracking-widest uppercase">Incognito</span>
               <button onClick={() => { setIncognito(!incognito); setConvId(null); setMessages([]); }} className={`w-10 h-5 rounded-full relative transition-colors ${incognito ? 'bg-red-900' : 'bg-gray-700'}`}>
                  <div className={`w-3 h-3 bg-gray-200 rounded-full absolute top-1 transition-all ${incognito ? 'left-6' : 'left-1'}`} />
               </button>
             </div>
             <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-red-900/50 px-3 py-1 rounded transition-colors">Logout</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-8 pb-32">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-20 flex flex-col items-center">
                <div className="w-16 h-16 bg-blue-900/20 rounded-full flex items-center justify-center mb-4"><svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></div>
                <h2 className="text-xl font-bold text-gray-300">Orchestrator Online.</h2>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-blue-900/50 border border-blue-800 flex items-center justify-center shrink-0 mt-1"><svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div>}
                  <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${m.role === 'user' ? 'bg-[#238636] text-white rounded-br-sm' : 'bg-[#161b22] border border-gray-800 text-gray-200 rounded-bl-sm shadow-sm'}`}>
                    {m.role === 'user' ? <div className="whitespace-pre-wrap">{m.content}</div> : <MarkdownRenderer content={m.content} />}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-4 bg-gradient-to-t from-[#0d1117] via-[#0d1117] to-transparent absolute bottom-0 left-0 right-0 md:left-64 lg:right-80">
          <div className="max-w-3xl mx-auto relative group">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask the orchestrator..." className="w-full bg-[#161b22] border border-gray-700 text-gray-100 rounded-xl pl-4 pr-12 py-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none shadow-xl transition-all h-[56px] min-h-[56px] max-h-[200px]" rows={1} />
            <button onClick={sendMessage} disabled={loading || !input.trim()} className="absolute right-3 top-3 p-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR: Telemetry */}
      <div className="w-80 bg-black border-l border-gray-800 flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#0d1117]">
           <span className="text-xs font-mono text-gray-400 font-bold tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> TELEMETRY SINK</span>
           <button onClick={() => setTelemetry([])} className="text-[10px] text-gray-600 hover:text-gray-300">CLEAR</button>
        </div>
        <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] text-gray-400 space-y-1.5 bg-[#0a0a0a]">
          {telemetry.map((log, i) => <div key={i} className={`${log.includes('[ERROR]') || log.includes('[FATAL]') ? 'text-red-400 font-bold' : log.includes('[SYSTEM]') ? 'text-green-400' : 'text-gray-500'}`}>{log}</div>)}
          <div ref={telemetryEndRef} />
        </div>
      </div>
    </div>
  );
}
