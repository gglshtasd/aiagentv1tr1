import { useState, useRef, useEffect } from 'react';
import { supabaseClient } from '../lib/supabase-client';

export default function ChatInterface() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Model Data
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  // Layout State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // Memory Engine State
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);

  // Execution State
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  useEffect(() => {
    initializeInterface();
  }, []);

  const initializeInterface = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      setUserId(session.user.id);
      loadConversations();
    }
    // Fetch active models dynamically
    const { data: mData } = await supabaseClient.from('model_registry').select('*').eq('is_available', true).order('tier');
    if (mData) setAvailableModels(mData);
  };

  const loadConversations = async () => {
    const { data } = await supabaseClient.from('conversations').select('*').order('created_at', { ascending: false });
    if (data) setConversations(data);
  };

  const selectConversation = async (convId: string) => {
    setCurrentConvId(convId);
    const { data } = await supabaseClient.from('messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (data) setChatHistory(data);
    setResponse('');
    setTerminalLogs(['> Connected to historical memory branch...']);
  };

  const startNewChat = () => {
    setCurrentConvId(null);
    setChatHistory([]);
    setResponse('');
    setTerminalLogs(['> Spun up new ephemeral execution branch...']);
  };

  const handleHardLogout = async () => {
    await supabaseClient.auth.signOut();
    localStorage.clear(); sessionStorage.clear();
    window.location.href = '/login'; 
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const currentPrompt = prompt;
    setPrompt('');
    setLoading(true);
    setIsTerminalOpen(true); // Auto-open terminal on submit
    setTerminalLogs(['> Initializing execution sequence...']);
    
    setChatHistory(prev => [...prev, { role: 'user', content: currentPrompt }]);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();

      // Database insertion
      let targetConvId = currentConvId;
      if (historyEnabled && !targetConvId && userId) {
         setTerminalLogs(prev => [...prev, '> Creating new ledger entry...']);
         const { data: newConv } = await supabaseClient.from('conversations').insert({
           user_id: userId, title: currentPrompt.substring(0, 30) + '...'
         }).select().single();
         if (newConv) {
           targetConvId = newConv.id;
           setCurrentConvId(newConv.id);
           setConversations(prev => [newConv, ...prev]);
         }
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          prompt: currentPrompt,
          modelId: isAdvancedMode ? selectedModel : 'auto',
          history_enabled: historyEnabled,
          conversation_id: targetConvId
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
                if (parsed.type === 'log') setTerminalLogs(prev => [...prev, parsed.message]);
                else if (parsed.type === 'token') {
                  currentResponse += parsed.text;
                  setResponse(currentResponse);
                } else if (parsed.type === 'error') alert(`Execution Error: ${parsed.message}`);
              } catch (e) {}
            }
          }
        }
      }
      
      setChatHistory(prev => [...prev, { role: 'assistant', content: currentResponse }]);
      setResponse('');

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans overflow-hidden">
      
      {/* 1. LEFT SIDEBAR: MEMORY ENGINE */}
      <div className={`bg-gray-900 flex flex-col border-r border-gray-700 transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 hidden'}`}>
        <div className="p-4 flex justify-between items-center border-b border-gray-700 h-16 shrink-0">
          <h2 className="font-bold text-gray-200">Session Logs</h2>
          <button onClick={startNewChat} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold shadow transition-colors">
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(c => (
            <button key={c.id} onClick={() => selectConversation(c.id)} className={`w-full text-left truncate px-3 py-2 rounded text-sm transition-colors ${currentConvId === c.id ? 'bg-gray-800 text-blue-400 font-semibold' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
              {c.title}
            </button>
          ))}
          {conversations.length === 0 && <div className="text-gray-600 text-xs text-center mt-4 italic">No secure logs found.</div>}
        </div>
        <div className="p-4 border-t border-gray-700 shrink-0">
           <button onClick={handleHardLogout} className="w-full flex items-center justify-center gap-2 bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 px-3 py-2 rounded font-bold text-sm transition-colors">
            ⏏️ Terminate Session
          </button>
        </div>
      </div>

      {/* 2. CENTER: MAIN EXECUTION AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        {/* TOP CONTROLS */}
        <div className="h-16 flex justify-between items-center bg-gray-900 px-4 border-b border-gray-800 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
            <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700">
              <button onClick={() => setIsAdvancedMode(false)} className={`px-4 py-1.5 rounded-md font-bold text-xs transition-all ${!isAdvancedMode ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
                Auto Router
              </button>
              <button onClick={() => setIsAdvancedMode(true)} className={`px-4 py-1.5 rounded-md font-bold text-xs transition-all ${isAdvancedMode ? 'bg-orange-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
                Select Target
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setHistoryEnabled(!historyEnabled)} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${historyEnabled ? 'text-gray-300 bg-gray-800 border border-gray-700' : 'text-red-400 bg-red-900/30 border border-red-900/50'}`}>
              {historyEnabled ? '🕒 Memory Active' : '🚫 Memory Disabled'}
            </button>
            <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${isTerminalOpen ? 'text-green-400 bg-green-900/30 border border-green-900/50' : 'text-gray-400 bg-gray-800 border border-gray-700'}`}>
              {isTerminalOpen ? '💻 Terminal On' : '💻 Terminal Off'}
            </button>
          </div>
        </div>

        {/* ADVANCED MODE DROPDOWN (Now explicitly styled for Dark Mode) */}
        {isAdvancedMode && (
          <div className="bg-gray-900 p-3 border-b border-gray-800 flex items-center shadow-inner shrink-0">
            <div className="w-full max-w-md flex items-center gap-4">
               <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Target Compute</label>
               <select 
                 value={selectedModel} 
                 onChange={(e) => setSelectedModel(e.target.value)}
                 className="flex-1 bg-gray-800 text-white border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
               >
                 <option value="auto">System Default (Auto-Route)</option>
                 {availableModels.map(m => (
                   <option key={m.model_id} value={m.model_id}>
                     {m.friendly_name} • [{m.tier}]
                   </option>
                 ))}
               </select>
            </div>
          </div>
        )}

        {/* MAIN CHAT LOG */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6 scroll-smooth">
          {chatHistory.map((msg, i) => (
             <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div className={`p-4 rounded-xl max-w-[85%] leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-800 text-gray-200 border border-gray-700 shadow-sm'}`}>
                  {msg.content}
               </div>
             </div>
          ))}

          {response && (
            <div className="flex justify-start">
               <div className="p-4 rounded-xl max-w-[85%] bg-gray-800 text-gray-200 border border-gray-700 shadow-sm leading-relaxed whitespace-pre-wrap">
                  {response}
               </div>
            </div>
          )}
        </div>

        {/* INPUT FORM */}
        <form onSubmit={handleSubmit} className="p-4 bg-gray-900 border-t border-gray-800 shrink-0 z-10">
          <div className="max-w-4xl mx-auto relative flex items-center shadow-lg">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Initialize execution sequence..."
              className="w-full pl-5 pr-28 py-4 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none h-[68px] font-medium transition-colors"
              required
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="absolute right-2 bg-white text-gray-900 px-5 py-2.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 font-bold transition-all"
            >
              {loading ? '...' : 'Execute'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. RIGHT SIDEBAR: TERMINAL */}
      <div className={`bg-black flex flex-col border-l border-gray-800 transition-all duration-300 ${isTerminalOpen ? 'w-80' : 'w-0 hidden'}`}>
        <div className="p-4 flex justify-between items-center border-b border-gray-800 h-16 shrink-0">
          <h2 className="font-mono text-xs font-bold text-green-500 tracking-widest uppercase">AWS_Gateway_Logs</h2>
          <button onClick={() => setIsTerminalOpen(false)} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-green-400/90 leading-relaxed tracking-wide space-y-1">
          {terminalLogs.map((log, i) => <div key={i} className="opacity-90">{log}</div>)}
          {loading && <div className="animate-pulse opacity-50 mt-2">█</div>}
          <div ref={terminalEndRef} />
        </div>
      </div>

    </div>
  );
}
