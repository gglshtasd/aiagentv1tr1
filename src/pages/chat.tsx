import { useState, useRef } from 'react';
import ModelSelector from '../components/ModelSelector';
import { supabaseClient } from '../lib/supabase-client';

export default function ChatInterface() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  
  // New State Controls
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      
      // 1. Upload files to Supabase Storage if any exist
      let fileUrls: string[] = [];
      if (attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          const filePath = `${session?.user.id}/${Date.now()}_${file.name}`;
          const { data } = await supabaseClient.storage.from('chat_attachments').upload(filePath, file);
          if (data) fileUrls.push(data.path);
        }
      }

      // 2. Send payload to our backend
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({
          prompt,
          modelId: isAdvancedMode ? selectedModel : 'auto', // Force auto unless advanced is on
          history_enabled: historyEnabled,
          file_urls: fileUrls
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResponse(data.text);
        setAttachedFiles([]); // Clear files on success
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 flex flex-col h-screen">
      
      {/* Top Header Controls (Gemini Style) */}
      <div className="flex justify-between items-center bg-white p-4 rounded-t-xl border-b border-gray-200">
        <div className="flex gap-4 items-center">
          <button 
            onClick={() => setIsAdvancedMode(false)}
            className={`px-4 py-2 rounded-full font-semibold text-sm transition-all ${!isAdvancedMode ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            ✨ Auto Mode
          </button>
          <button 
            onClick={() => setIsAdvancedMode(true)}
            className={`px-4 py-2 rounded-full font-semibold text-sm transition-all ${isAdvancedMode ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            ⚙️ Advanced Mode
          </button>
        </div>

        <button 
          onClick={() => setHistoryEnabled(!historyEnabled)}
          className={`flex items-center gap-2 px-3 py-1 rounded text-sm font-bold ${historyEnabled ? 'text-gray-600' : 'text-red-500 bg-red-50'}`}
          title="When off, this chat will not be saved to your database history."
        >
          {historyEnabled ? '🕒 History On' : '🚫 History Off'}
        </button>
      </div>

      {/* Advanced Mode Controls */}
      {isAdvancedMode && (
        <div className="bg-orange-50 p-4 border-b border-orange-100 flex gap-4">
          <div className="flex-1">
             <ModelSelector selectedModelId={selectedModel} onModelSelect={setSelectedModel} />
          </div>
          <div className="flex items-end">
            <button className="bg-gray-900 text-white px-4 py-2 rounded text-sm font-bold shadow-sm">
              🚀 Spin Up Instance
            </button>
          </div>
        </div>
      )}

      {/* Chat Display Area */}
      <div className="flex-1 bg-gray-50 overflow-y-auto p-6 space-y-4">
        {response && (
           <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 whitespace-pre-wrap">
             {response}
           </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-200">
        
        {/* File Preview */}
        {attachedFiles.length > 0 && (
          <div className="flex gap-2 mb-2">
            {attachedFiles.map((file, i) => (
              <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md flex items-center gap-1 border border-blue-200">
                📄 {file.name}
              </span>
            ))}
          </div>
        )}

        <div className="relative flex items-center">
          <input 
            type="file" 
            multiple 
            className="hidden" 
            ref={fileInputRef}
            onChange={(e) => { if (e.target.files) setAttachedFiles(Array.from(e.target.files)) }}
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute left-3 text-gray-400 hover:text-blue-500 p-2"
          >
            📎
          </button>
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask anything or attach files..."
            className="w-full pl-12 pr-24 py-4 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 resize-none h-16"
            required
          />

          <button
            type="submit"
            disabled={loading || (!prompt && attachedFiles.length === 0)}
            className="absolute right-3 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold"
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
