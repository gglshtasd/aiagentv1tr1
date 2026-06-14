import { createClient } from '@supabase/supabase-js';

// Requires the service role key to bypass RLS for system-level ledger updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const OVERHEAD_OPS_COST_INR = 0.05; // Base operational overhead per request

export function calculateTransactionFee(
  inputTokens: number,
  outputTokens: number,
  inputCostPer1k: number,
  outputCostPer1k: number,
  marginMultiplier: number
): { baseCost: number; finalFee: number } {
  const priceIn = (inputTokens / 1000) * inputCostPer1k;
  const priceOut = (outputTokens / 1000) * outputCostPer1k;
  
  const baseCost = priceIn + priceOut + OVERHEAD_OPS_COST_INR;
  const finalFee = baseCost * (1 + marginMultiplier);

  return { baseCost, finalFee };
}

export async function authorizeCompute(userId: string, estimatedFee: number): Promise<{ authorized: boolean; reason?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('users_wallet')
      .select('balance_inr, monthly_credit_limit_inr, is_blocked')
      .eq('user_id', userId)
      .single();

    if (error || !data) throw error;
    if (data.is_blocked) return { authorized: false, reason: "Account is blocked by administrator." };
    
    const availableCredit = Number(data.monthly_credit_limit_inr) - Number(data.balance_inr);
    
    if (availableCredit < estimatedFee) {
      return { authorized: false, reason: `Insufficient Funds. Estimated fee: ₹${estimatedFee.toFixed(2)}, Available: ₹${availableCredit.toFixed(2)}` };
    }

    return { authorized: true };
  } catch (error) {
    console.error("[BILLING ENGINE] Authorization Error:", error);
    return { authorized: false, reason: "Failed to access billing ledger." };
  }
}

export async function chargeWallet(
  userId: string,
  tierUsed: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  inputCostPer1k: number,
  outputCostPer1k: number,
  marginMultiplier: number
): Promise<{ success: boolean; finalFee?: number; error?: unknown }> {
  try {
    const { baseCost, finalFee } = calculateTransactionFee(
      inputTokens, outputTokens, inputCostPer1k, outputCostPer1k, marginMultiplier
    );

    // 1. Log Transaction
    const { error: txError } = await supabaseAdmin
      .from('transaction_ledger')
      .insert({
        user_id: userId,
        tier_used: tierUsed,
        model_id: modelId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        base_cost_inr: baseCost,
        final_fee_inr: finalFee,
        status: 'completed'
      });
    
    if (txError) throw txError;

    // 2. Safely Update Wallet Balance
    const { data: wallet, error: fetchErr } = await supabaseAdmin
      .from('users_wallet')
      .select('balance_inr')
      .eq('user_id', userId)
      .single();
      
    if (fetchErr) throw fetchErr;

    const newBalance = Number(wallet.balance_inr) + finalFee;

    const { error: updateErr } = await supabaseAdmin
      .from('users_wallet')
      .update({ balance_inr: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateErr) throw updateErr;

    return { success: true, finalFee };
  } catch (error) {
    console.error("[BILLING ENGINE] Charge Error:", error);
    return { success: false, error };
  }
}
