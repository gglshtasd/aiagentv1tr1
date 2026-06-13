// src/pages/chat.tsx
import { useState, useRef, useEffect } from 'react';
import ModelSelector from '../components/ModelSelector';
import { supabaseClient } from '../lib/supabase-client';

export default function ChatInterface() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Execution & Terminal State
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // ---> NEW HARD LOGOUT FUNCTION <---
  const handleHardLogout = async () => {
    // 1. Destroy the Supabase Server Session
    await supabaseClient.auth.signOut();
    
    // 2. Nuke local browser memory caches
    localStorage.clear();
    sessionStorage.clear();
    
    // 3. Force a hard window redirection to clear Next.js client-side router cache
    window.location.href = '/login'; 
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResponse('');
    setTerminalLogs(['> Initializing execution sequence...']);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({
          prompt,
          modelId: isAdvancedMode ? selectedModel : 'auto',
          history_enabled: historyEnabled,
        }),
      });

      // --- READ THE SSE STREAM ---
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
              if (!dataStr) continue;
              
              try {
                const parsed = JSON.parse(dataStr);
                
                if (parsed.type === 'log') {
                  setTerminalLogs(prev => [...prev, parsed.message]);
                } else if (parsed.type === 'token') {
                  currentResponse += parsed.text;
                  setResponse(currentResponse); // Live typing effect
                } else if (parsed.type === 'error') {
                  alert(`Execution Error: ${parsed.message}`);
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 flex flex-col h-screen font-sans">
      
      {/* Top Header Controls */}
      <div className="flex justify-between items-center bg-white p-4 rounded-t-xl border-b border-gray-200 shadow-sm">
        <div className="flex gap-4 items-center">
          <button onClick={() => setIsAdvancedMode(false)} className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${!isAdvancedMode ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
            ✨ Auto Mode
          </button>
          <button onClick={() => setIsAdvancedMode(true)} className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${isAdvancedMode ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-100'}`}>
            ⚙️ Advanced Mode
          </button>
        </div>
        
        {/* RIGHT SIDE CONTROLS */}
        <div className="flex gap-2">
          <button onClick={() => setHistoryEnabled(!historyEnabled)} className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold ${historyEnabled ? 'text-gray-600 bg-gray-100' : 'text-red-500 bg-red-50'}`}>
            {historyEnabled ? '🕒 History ON' : '🚫 History OFF'}
          </button>
          {/* ---> NEW LOGOUT BUTTON <--- */}
          <button onClick={handleHardLogout} className="flex items-center gap-2 px-3 py-1 rounded text-xs font-bold text-red-600 bg-red-100 hover:bg-red-200 transition-colors">
            ⏏️ Logout
          </button>
        </div>
      </div>

      {isAdvancedMode && (
        <div className="bg-orange-50 p-4 border-b border-orange-100 flex gap-4">
          <div className="flex-1"><ModelSelector selectedModelId={selectedModel} onModelSelect={setSelectedModel} /></div>
          <div className="flex items-end">
            <button className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded font-bold shadow-sm">
              🚀 Spin Up Instance
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 bg-gray-50 overflow-y-auto p-6 flex flex-col gap-4">
        
        {/* THE TERMINAL LOGS */}
        {(terminalLogs.length > 0) && (
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 shadow-inner h-48 overflow-y-auto border border-gray-700 w-full mb-4">
            {terminalLogs.map((log, i) => (
              <div key={i} className="mb-1 opacity-90">{log}</div>
            ))}
            {loading && <div className="animate-pulse opacity-50 mt-2">_</div>}
            <div ref={terminalEndRef} />
          </div>
        )}

        {/* STREAMING RESPONSE VIEW */}
        {response && (
           <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 whitespace-pre-wrap text-gray-800 leading-relaxed">
             {response}
           </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-200">
        <div className="relative flex items-center">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Initialize task sequence..."
            className="w-full pl-4 pr-24 py-4 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 resize-none h-16 font-medium"
            required
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          />
          <button
            type="submit"
            disabled={loading || !prompt}
            className="absolute right-3 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold"
          >
            {loading ? 'Running...' : 'Execute'}
          </button>
        </div>
      </form>
    </div>
  );
}
