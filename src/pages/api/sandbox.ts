import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Define pricing structure (e.g., 0.50 INR per minute for basic computing node)
const E2E_INR_PER_MINUTE = 0.50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.split(' ')[1];
  const { command_to_run, project_context } = req.body;

  if (!token) return res.status(401).json({ success: false, error: 'Missing token' });

  let instanceId = '';
  let ledgerId = '';
  const startTime = Date.now();

  try {
    // 1. Authenticate user session
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized access");

    // 2. Provision the computing instance via E2E Networks API
    // Using standard E2E REST infrastructure protocols
    const e2eLaunchRes = await fetch('https://api.e2enetworks.com/v1/node', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.E2E_TIR_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: 'ubuntu-22.04-lts',
        plan: 'c3.m4', // Basic compute workspace option
        location: 'delhi',
        name: `sandbox-agent-${user.id.slice(0, 5)}`
      })
    });

    const launchData = await e2eLaunchRes.json();
    if (!e2eLaunchRes.ok) throw new Error(`E2E Node creation failed: ${launchData.message || 'Unknown error'}`);
    
    instanceId = launchData.node_id;

    // 3. Document the start of the session in your billing ledger
    const { data: ledgerEntry, error: ledgerErr } = await supabaseAdmin
      .from('billing_ledger')
      .insert({
        user_id: user.id,
        service_type: 'E2E_COMPUTE',
        amount_inr: 0, // Starts at zero, updated upon teardown
        description: `Provisioned Sandbox Node [ID: ${instanceId}]`
      })
      .select()
      .single();

    if (ledgerErr) throw ledgerErr;
    ledgerId = ledgerEntry.id;

    // 4. WORKSPACE EXECUTION STAGE
    // Here your agent handles its tasks on the running server node
    // For a resume project, simulating execution or inserting a delay serves perfectly for testing
    await new Promise((resolve) => setTimeout(resolve, 5000)); 

    // 5. TEARDOWN STAGE: Safely shut down and destroy the active compute instance
    const destroyRes = await fetch(`https://api.e2enetworks.com/v1/node/${instanceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${process.env.E2E_TIR_API_KEY}` }
    });

    if (!destroyRes.ok) console.error(`⚠️ Warning: Node ${instanceId} failed automated deletion.`);

    // 6. LEDGER CALCULATION: Apply the precise minute consumption fees to the bill
    const endTime = Date.now();
    const durationInMinutes = Math.max(1, (endTime - startTime) / 1000 / 60);
    const finalBillableInr = parseFloat((durationInMinutes * E2E_INR_PER_MINUTE).toFixed(4));

    await supabaseAdmin
      .from('billing_ledger')
      .update({ 
        amount_inr: finalBillableInr, 
        description: `Completed Sandbox Session. Node active for ${durationInMinutes.toFixed(2)} mins.` 
      })
      .eq('id', ledgerId);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Sandbox workflow finished completely.',
        runtime_minutes: durationInMinutes,
        inr_billed: finalBillableInr
      }
    });

  } catch (error: any) {
    // FAILSAFE: If code execution errors out mid-way, ensure infrastructure terminates to clear billing
    if (instanceId) {
      await fetch(`https://api.e2enetworks.com/v1/node/${instanceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${process.env.E2E_TIR_API_KEY}` }
      });
    }

    // Flag the failed event in the billing records
    if (ledgerId) {
      await supabaseAdmin
        .from('billing_ledger')
        .update({ description: `Session crashed: ${error.message}` })
        .eq('id', ledgerId);
    }

    return res.status(500).json({ success: false, error: error.message });
  }
}
