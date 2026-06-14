import MarkdownRenderer from '../components/MarkdownRenderer';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '../lib/supabase-client';
import ModelSelector from '../components/ModelSelector';
import { Paperclip, Loader2, LogOut } from 'lucide-react';

export default function ChatInterface() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  // UI & Tool States
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [modelMode, setModelMode] = useState<'auto' | 'manual'>('auto');
  const [selectedModel, setSelectedModel] = useState('gpt-oss-safeguard');
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [pendingTool, setPendingTool] = useState<any>(null);

  // Advanced Mode States
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(4000);

  // Memory
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [terminalLogs]);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) loadConversations();
      else router.push('/login');
    });
  }, []);

  const loadConversations = async () => {
    const { data } = await supabaseClient.from('conversations').select('*').order('created_at', { ascending: false });
    if (data) setConversations(data);
  };

  const loadHistoricalMessages = async (convId: string) => {
    setCurrentConvId(convId);
    setLoading(true);
    const { data } = await supabaseClient.from('messages').select('role, content').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (data) setChatHistory(data);
    else setChatHistory([]);
    setLoading(false);
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
          conversation_id: currentConvId,
          temperature: modelMode === 'manual' ? temperature : undefined,
          maxTokens: modelMode === 'manual' ? maxTokens : undefined
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
                if (parsed.type === 'tool_permission') { setPendingTool(parsed); setLoading(false); return; }
                
                // BUG FIX: Lock the new conversation ID to the active state instantly
                if (parsed.type === 'conversation_id') { setCurrentConvId(parsed.id); } 
                
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

  const handleToolApproval = async () => {
    setTerminalLogs(prev => [...prev, `> User authorized ${pendingTool?.tool}. Deploying sequence...`]);
    const currentTool = pendingTool;
    setPendingTool(null);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const res = await fetch('/api/execute-tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ tool: currentTool.tool, compressed_prompt: currentTool.compressed_prompt, target_model: currentTool.target_model })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTerminalLogs(prev => [...prev, `> Action successful. Logs: ${data.logs}`, `> Account debited ₹${data.charged_inr.toFixed(2)}`]);
      setChatHistory(prev => [...prev, { role: 'assistant', content: `**Tool Execution Complete:** \n\`\`\`\n${data.logs}\n\`\`\`` }]);
    } catch (err: any) {
      setTerminalLogs(prev => [...prev, `> [FATAL] Tool execution failed: ${err.message}`]);
    }
  };
  
  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  // Group Conversations chronologically
  const groupedConversations = conversations.reduce((acc, curr) => {
    const date = new Date(curr.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let group = 'Previous';
    if (date.toDateString() === today.toDateString()) group = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) group = 'Yesterday';
    
    if (!acc[group]) acc[group] = [];
    acc[group].push(curr);
    return acc;
  }, { Today: [], Yesterday: [], Previous: [] });

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans overflow-hidden">
      
      {pendingTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-600 shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2">⚠️ Authorization Required</h3>
            <p className="text-gray-300 text-sm mb-4">Requesting to execute <span className="font-mono text-orange-400">{pendingTool.tool}</span>.</p>
            <div className="flex gap-4">
              <button onClick={() => { setTerminalLogs(prev => [...prev, `> Denied ${pendingTool.tool}.`]); setPendingTool(null); }} className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded font-bold">Deny</button>
              <button onClick={handleToolApproval} className="flex-1 bg-orange-600 hover:bg-orange-500 py-2 rounded font-bold">Approve</button>
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
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {Object.entries(groupedConversations).map(([group, convs]: [string, any]) => (
            convs.length > 0 && (
              <div key={group}>
                <div className="text-xs font-bold text-gray-500 mb-1 px-2 uppercase">{group}</div>
                {convs.map((c: any) => (
                  <button key={c.id} onClick={() => loadHistoricalMessages(c.id)} className={`w-full text-left truncate px-3 py-2 rounded text-sm transition-colors ${currentConvId === c.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
                    {c.title}
                  </button>
                ))}
              </div>
            )
          ))}
        </div>
      </div>

      {/* MAIN VIEW */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        <div className="h-16 flex justify-between items-center bg-gray-900 px-4 border-b border-gray-800 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800">☰</button>
          <div className="flex items-center gap-4">
            
            {/* ADVANCED UI CONTROLS */}
            <div className="flex bg-gray-800 p-1 rounded-md text-xs font-bold mr-2">
              <button onClick={() => setModelMode('auto')} className={`px-3 py-1 rounded ${modelMode === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>AUTO</button>
              <button onClick={() => setModelMode('manual')} className={`px-3 py-1 rounded ${modelMode === 'manual' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>ADVANCED</button>
            </div>
            
            {modelMode === 'manual' && (
              <div className="flex items-center gap-4 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700">
                <div className="w-40"><ModelSelector selectedModelId={selectedModel} onModelSelect={setSelectedModel} /></div>
                <div className="flex flex-col w-24">
                  <label className="text-[10px] text-gray-400 flex justify-between"><span>Temp</span><span>{temperature}</span></label>
                  <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="flex flex-col w-20">
                  <label className="text-[10px] text-gray-400">Tokens</label>
                  <input type="number" min="1" max="8000" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))} className="bg-gray-900 text-white text-xs px-1 py-0.5 rounded border border-gray-600 focus:outline-none" />
                </div>
              </div>
            )}

            <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className="px-3 py-1.5 rounded text-xs font-bold text-green-400 bg-green-900/30 border border-green-800">Terminal</button>
            
            {/* LOGOUT BUTTON ADDED HERE */}
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold text-red-400 bg-red-900/30 border border-red-800 hover:bg-red-900/60 hover:text-white transition-colors"
              title="Sign Out"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>

        {/* CHAT MESSAGES AREA */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatHistory.map((msg, idx) => (
             <div key={idx} className={`p-4 rounded-lg max-w-4xl mx-auto ${msg.role === 'user' ? 'bg-gray-800 border border-gray-700' : 'bg-transparent'}`}>
                <div className="font-bold text-xs text-gray-500 mb-2 uppercase tracking-wider">{msg.role}</div>
                <MarkdownRenderer content={msg.content} />
             </div>
          ))}
          {response && (
             <div className="p-4 rounded-lg max-w-4xl mx-auto bg-transparent">
                <div className="font-bold text-xs text-gray-500 mb-2 uppercase tracking-wider">ASSISTANT</div>
                <MarkdownRenderer content={response} />
             </div>
          )}
          {loading && !response && <div className="text-gray-500 animate-pulse text-center">Processing...</div>}
        </div>
        
        {/* INPUT BOX WITH FILE ATTACHMENT */}
        <div className="p-4 bg-gray-900 border-t border-gray-800">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-2 items-center">
            
            {/* Hidden File Input & Trigger */}
            <input 
              type="file" 
              id="file-upload" 
              className="hidden" 
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLoading(true);
                try {
                  const { data: { session } } = await supabaseClient.auth.getSession();
                  
                  // 1. Get Presigned URL
                  const urlRes = await fetch('/api/storage/get-upload-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                    body: JSON.stringify({ fileName: file.name, fileType: file.type })
                  });
                  const urlData = await urlRes.json();
                  if (!urlData.success) throw new Error(urlData.error);

                  // 2. Upload to S3 Zero-Egress Shield
                  await fetch(urlData.data.uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type },
                    body: file
                  });

                  // 3. Append to Prompt
                  setPrompt(prev => prev + `\n[Attached File Context: ${urlData.data.publicUrl}]\n`);
                } catch (err) {
                  alert("File upload failed.");
                } finally {
                  setLoading(false);
                }
              }}
            />
            <label htmlFor="file-upload" className={`p-3 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
               {loading ? <Loader2 size={20} className="text-gray-400 animate-spin" /> : <Paperclip size={20} className="text-gray-400" />}
            </label>

            {/* Existing Text Input */}
            <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)} className="flex-1 bg-gray-800 p-3 rounded-lg border border-gray-700 text-white focus:outline-none focus:border-blue-500" placeholder="Enter directive or attach file..." disabled={loading} />
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-bold transition-colors">Send</button>
          </form>
        </div>

        {/* TERMINAL OVERLAY */}
        {isTerminalOpen && (
           <div className="absolute top-16 right-0 w-96 bottom-0 bg-black border-l border-gray-800 p-4 overflow-y-auto font-mono text-xs text-green-400 z-10 shadow-2xl">
             <div className="flex justify-between items-center mb-4 border-b border-green-900 pb-2">
               <span className="font-bold tracking-widest uppercase">System Logs</span>
               <button onClick={() => setTerminalLogs([])} className="text-gray-500 hover:text-green-400">[CLEAR]</button>
             </div>
             {terminalLogs.map((log, i) => <div key={i} className="mb-1 leading-relaxed break-words">{log}</div>)}
             <div ref={terminalEndRef} />
           </div>
        )}
      </div>
    </div>
  );
}
