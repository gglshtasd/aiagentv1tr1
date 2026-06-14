import MarkdownRenderer from '../components/MarkdownRenderer';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '../lib/supabase-client';
import ModelSelector from '../components/ModelSelector';

export default function ChatInterface() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // UI & Tool States
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [modelMode, setModelMode] = useState<'auto' | 'manual'>('auto');
  const [selectedModel, setSelectedModel] = useState('gpt-oss-safeguard');
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [pendingTool, setPendingTool] = useState<any>(null);

  // Memory
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [terminalLogs]);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // FIXED: Fallback to null if undefined to satisfy TypeScript
        setUserEmail(session.user.email ?? null);
        loadConversations();
      } else {
        router.push('/login');
      }
    });
  }, []);

  const loadConversations = async () => {
    const { data } = await supabaseClient.from('conversations').select('*').order('created_at', { ascending: false });
    if (data) setConversations(data);
  };

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const currentPrompt = prompt;
    setPrompt('');
    setLoading(true);
    setIsTerminalOpen(true);
    setTerminalLogs(['> Initializing execution sequence...']);
    setChatHistory(prev => [...prev, { role: 'user', content: currentPrompt }]);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          prompt: currentPrompt,
          modelId: modelMode === 'auto' ? 'auto' : selectedModel,
          history_enabled: historyEnabled,
          conversation_id: currentConvId
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let currentResponse = '';

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const lines = part.split('\n').filter(l => l.startsWith('data: '));
            for (const line of lines) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.type === 'tool_permission') {
                   setPendingTool(parsed); setLoading(false); return;
                }
                if (parsed.type === 'log') setTerminalLogs(prev => [...prev, parsed.message]);
                else if (parsed.type === 'token') { currentResponse += parsed.text; setResponse(currentResponse); }
                else if (parsed.type === 'error') alert(`Gateway Error: ${parsed.message}`);
              } catch (e) {}
            }
          }
        }
      }
      setChatHistory(prev => [...prev, { role: 'assistant', content: currentResponse }]);
      setResponse('');
      loadConversations();
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans overflow-hidden">
      
      {/* TOOL MODAL */}
      {pendingTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-600 shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2">⚠️ Authorization Required</h3>
            <p className="text-gray-300 text-sm mb-4">Requesting to execute <span className="font-mono text-orange-400">{pendingTool.tool}</span>.</p>
            <div className="flex gap-4">
              <button onClick={() => setPendingTool(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded font-bold">Deny</button>
              <button onClick={() => setPendingTool(null)} className="flex-1 bg-orange-600 hover:bg-orange-500 py-2 rounded font-bold">Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className={`bg-gray-900 flex flex-col border-r border-gray-700 transition-all ${isSidebarOpen ? 'w-64' : 'w-0 hidden'}`}>
        <div className="p-4 flex justify-between items-center border-b border-gray-700 h-16 shrink-0">
          <h2 className="font-bold text-gray-200">Session Logs</h2>
          <button onClick={() => { setCurrentConvId(null); setChatHistory([]); setResponse(''); }} className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs font-bold">+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(c => (
            <button key={c.id} onClick={() => { setCurrentConvId(c.id); loadConversations(); }} className="w-full text-left truncate px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800">{c.title}</button>
          ))}
        </div>
      </div>

      {/* MAIN VIEW */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        
        {/* HEADER BAR (Restores all buttons) */}
        <div className="h-16 flex justify-between items-center bg-gray-900 px-4 border-b border-gray-800 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800">☰</button>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-800 p-1 rounded-md text-xs font-bold">
              <button onClick={() => setModelMode('auto')} className={`px-3 py-1 rounded ${modelMode === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>AUTO (Gemma)</button>
              <button onClick={() => setModelMode('manual')} className={`px-3 py-1 rounded ${modelMode === 'manual' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>MANUAL</button>
            </div>
            
            {modelMode === 'manual' && (
              <div className="w-48"><ModelSelector selectedModelId={selectedModel} onModelSelect={setSelectedModel} /></div>
            )}

            <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className="px-3 py-1.5 rounded text-xs font-bold text-green-400 bg-green-900/30 border border-green-900/50">💻 Logs</button>
            <div className="h-6 w-px bg-gray-700"></div>
            <span className="text-xs text-gray-400 hidden md:block">{userEmail}</span>
            <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 font-bold px-2">Logout</button>
          </div>
        </div>

        {/* CHAT DISPLAY */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6">
          {chatHistory.map((msg, i) => (
             <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               {/* Inside the mapping of chatHistory */}
               <div className={`p-4 rounded-xl max-w-[85%] leading-relaxed overflow-hidden ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
                 {msg.role === 'user' ? msg.content : <MarkdownRenderer content={msg.content} />}
               </div>
             </div>
          ))}
          {response && (
            <div className="flex justify-start">
               {/* Inside the live response block */}
               <div className="p-4 rounded-xl max-w-[85%] bg-gray-800 text-gray-200 border border-gray-700 overflow-hidden">
                 <MarkdownRenderer content={response} />
               </div>
            </div>
          )}
        </div>

        {/* INPUT FORM */}
        <form onSubmit={handleSubmit} className="p-4 bg-gray-900 border-t border-gray-800">
          <div className="max-w-4xl mx-auto relative flex items-center">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Initialize sequence..." className="w-full pl-5 pr-28 py-4 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none h-[68px]" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} />
            <button type="submit" disabled={loading} className="absolute right-2 bg-white text-gray-900 px-5 py-2.5 rounded-lg font-bold">{loading ? '...' : 'Execute'}</button>
          </div>
        </form>
      </div>

      {/* TERMINAL */}
      <div className={`bg-black flex flex-col border-l border-gray-800 transition-all ${isTerminalOpen ? 'w-80' : 'w-0 hidden'}`}>
        <div className="p-4 flex justify-between items-center border-b border-gray-800 h-16">
          <h2 className="font-mono text-xs font-bold text-green-500 tracking-widest uppercase">AWS_Gateway_Logs</h2>
          <button onClick={() => setIsTerminalOpen(false)} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-green-400/90 space-y-1">
          {terminalLogs.map((log, i) => <div key={i}>{log}</div>)}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
