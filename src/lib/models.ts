// src/lib/models.ts
export type AIModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

// Removed the static AVAILABLE_MODELS array as per Task 1 Step 2.
// Model routing is now exclusively resolved via Supabase model_registry table.
