import { useState } from 'react';
import ModelSelector from './ModelSelector';

export default function RequestForm() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('openai.gpt-5.4'); // Default fallback
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelId: selectedModel, // Pass the dynamic selection to the API
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResponse(data.text);
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
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Dropdown Component */}
      <ModelSelector 
        selectedModelId={selectedModel} 
        onModelSelect={setSelectedModel} 
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Prompt Vector</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md h-32 focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading || !prompt || !selectedModel}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
      >
        {loading ? 'Executing Pipeline...' : 'Run Execution'}
      </button>

      {response && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md whitespace-pre-wrap text-sm">
          {response}
        </div>
      )}
    </form>
  );
}
