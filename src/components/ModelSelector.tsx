import { AVAILABLE_MODELS } from '../lib/models';

interface ModelSelectorProps {
  selectedModelId: string;
  onModelSelect: (modelId: string) => void;
}

export default function ModelSelector({ selectedModelId, onModelSelect }: ModelSelectorProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Execution Model
      </label>
      <select
        value={selectedModelId}
        onChange={(e) => onModelSelect(e.target.value)}
        className="w-full p-2.5 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
      >
        <option value="" disabled>Select an AI model...</option>
        {AVAILABLE_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.provider} - {model.name}
          </option>
        ))}
      </select>
      
      {/* Dynamic Description Display */}
      {selectedModelId && (
        <p className="mt-2 text-xs text-gray-500">
          {AVAILABLE_MODELS.find(m => m.id === selectedModelId)?.description}
        </p>
      )}
    </div>
  );
}
