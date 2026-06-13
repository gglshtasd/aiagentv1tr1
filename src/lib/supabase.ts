// src/lib/supabase.ts

// ... (existing imports and code)

export async function getAvailableModels(tier: Tier): Promise<string[]> {
  try {
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('model_registry')
      .select('model_id')
      .eq('tier', tier)
      .eq('is_available', true);

    if (error) {
      throw new Error(`failed to query model_registry: ${error.message}`);
    }

    return (data ?? []).map((row) => row.model_id);
  } catch (error) {
    throw new Error(`database connection error (model_registry): ${(error as Error).message}`);
  }
}
