import { useState } from 'react';
import ModelSelector from '../components/ModelSelector';
import { supabaseClient } from '../lib/supabase-client'; // 1. Import your Supabase client

export default function RequestForm() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('openai.gpt-5.4');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 2. Grab the active session token from local storage via Supabase
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // 3. Attach the token here
        },
        body: JSON.stringify({
          prompt,
          modelId: selectedModel, 
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

  // ... rest of your component rendering
