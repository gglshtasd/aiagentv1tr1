import { useState, useRef, useEffect } from 'react';
import { supabaseClient } from '../lib/supabase-client';

export default function ChatInterface() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Layout State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // Memory & Execution State
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  
  // Tool Permission Gate State
  const [pendingTool, setPendingTool] = useState<{tool: string, compressed_prompt: string, target_model: string} | null>(null);

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
  };

  const loadConversations = async () => {
    // RLS Policy now ensures this only fetches the user's secure logs
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
          modelId: 'auto',
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
                
                // --- INTERCEPT TOOL PERMISSION REQUEST ---
                if (parsed.type === 'tool_permission') {
                   setPendingTool({
                       tool: parsed.tool,
                       compressed_prompt: parsed.compressed_prompt,
                       target_model: parsed.target_model
                   });
                   setLoading(false);
                   return; // Halt stream rendering
                }
                
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
      loadConversations(); // Refresh sidebar

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Phase 4 Placeholder logic: We will build this out fully in the next phase
  const handleToolApproval = async () => {
      setTerminalLogs(prev => [...prev, `> User authorized ${pendingTool?.tool}. Deploying sequence...`]);
      setPendingTool(null);
      // NEXT PHASE: Call '/api/execute-tool' with CodeBuild or GitHub Action Logic
  };

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans overflow-hidden">
      
      {/* TOOL PERMISSION MODAL */}
      {pendingTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-600 shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">⚠️ Authorization Required</h3>
            <p className="text-gray-300 text-sm mb-4">
              The AI Orchestrator has requested elevated permissions to execute <span className="font-mono text-orange-400">{pendingTool.tool}</span>. 
            </p>
            <div className="flex gap-4">
              <button onClick={() => setPendingTool(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded font-bold transition-colors">Deny</button>
              <button onClick={handleToolApproval} className="flex-1 bg-orange-600 hover:bg-orange-500 py-2 rounded font-bold transition-colors">Approve Execution</button>
            </div>
          </div>
        </div>
      )}

      {/* 1. LEFT SIDEBAR: MEMORY ENGINE */}
      <div className={`bg-gray-900 flex flex-col border-r border-gray-700 transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 hidden'}`}>
        <div className="p-4 flex justify-between items-center border-b border-gray-700 h-16 shrink-0">
          <h2 className="font-bold text-gray-200">Session Logs</h2>
          <button onClick={startNewChat} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold shadow transition-colors">+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(c => (
            <button key={c.id} onClick={() => selectConversation(c.id)} className={`w-full text-left truncate px-3 py-2 rounded text-sm transition-colors ${currentConvId === c.id ? 'bg-gray-800 text-blue-400 font-semibold' : 'text-gray-400 hover:bg-gray-800'}`}>
              {c.title}
            </button>
          ))}
        </div>
      </div>

      {/* 2. CENTER: MAIN EXECUTION AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        <div className="h-16 flex justify-between items-center bg-gray-900 px-4 border-b border-gray-800 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800">☰</button>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className={`px-3 py-1.5 rounded text-xs font-bold ${isTerminalOpen ? 'text-green-400 bg-green-900/30 border border-green-900/50' : 'text-gray-400 bg-gray-800 border border-gray-700'}`}>
              💻 Terminal
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6">
          {chatHistory.map((msg, i) => (
             <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div className={`p-4 rounded-xl max-w-[85%] leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
                  {msg.content}
               </div>
             </div>
          ))}
          {response && (
            <div className="flex justify-start">
               <div className="p-4 rounded-xl max-w-[85%] bg-gray-800 text-gray-200 border border-gray-700 whitespace-pre-wrap">
                  {response}
               </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 bg-gray-900 border-t border-gray-800">
          <div className="max-w-4xl mx-auto relative flex items-center">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Initialize sequence..."
              className="w-full pl-5 pr-28 py-4 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none h-[68px]"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
            />
            <button type="submit" disabled={loading} className="absolute right-2 bg-white text-gray-900 px-5 py-2.5 rounded-lg font-bold">
              {loading ? '...' : 'Execute'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. RIGHT SIDEBAR: TERMINAL */}
      <div className={`bg-black flex flex-col border-l border-gray-800 transition-all duration-300 ${isTerminalOpen ? 'w-80' : 'w-0 hidden'}`}>
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
