export type AIModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: "anthropic.claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Fast, cost-effective for high-volume tasks"
  },
  {
    id: "openai.gpt-5.4",
    name: "GPT-5.4 (Default)",
    provider: "OpenAI",
    description: "Flagship intelligence model"
  },
  {
    id: "openai.gpt-5.4-2026-03-05",
    name: "GPT-5.4 (March 2026 Snapshot)",
    provider: "OpenAI",
    description: "Stable snapshot for consistent output"
  },
  {
    id: "nvidia.nemotron-super-3-120b",
    name: "Nemotron Super 3 120B",
    provider: "Nvidia",
    description: "High-compute advanced logic modeling"
  },
  {
    id: "openai.gpt-oss-safeguard-20b",
    name: "OSS Safeguard 20B",
    provider: "OpenAI",
    description: "Optimized for security and compliance checks"
  }
];
