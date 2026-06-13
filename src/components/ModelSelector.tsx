import { useEffect, useState } from 'react';
import { supabaseClient } from '../lib/supabase-client';

interface ModelItem {
  model_id: string;
  friendly_name: string;
  tier: string;
  is_available: boolean;
}

interface ModelSelectorProps {
  selectedModelId: string;
  onModelSelect: (id: string) => void;
}

export default function ModelSelector({ selectedModelId, onModelSelect }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAvailableModels() {
      const { data, error } = await supabaseClient
        .from('model_registry')
        .select('*')
        .eq('is_available', true); // Only display verified functional models

      if (!error && data) {
        setModels(data);
        // Automatically default to the first functional model if current selection is invalid
        if (data.length > 0 && !data.find(m => m.model_id === selectedModelId)) {
          onModelSelect(data[0].model_id);
        }
      }
      setLoading(false);
    }
    loadAvailableModels();
  }, [selectedModelId, onModelSelect]);

  if (loading) return <div className="text-xs text-gray-500">Loading authorized gateways...</div>;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Active Target Model</label>
      <select
        value={selectedModelId}
        onChange={(e) => onModelSelect(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm"
      >
        {models.map((model) => (
          <option key={model.model_id} value={model.model_id}>
            {model.friendly_name} ({model.tier.toUpperCase()})
          </option>
        ))}
      </select>
    </div>
  );
}
