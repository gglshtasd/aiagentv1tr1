import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.split(' ')[1];
  
  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");
    
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') throw new Error("Restricted to Admin personnel.");

    if (req.method === 'GET') {
      const { data } = await supabaseAdmin.from('system_pricing').select('*').order('service_name');
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const { id, margin_multiplier, base_cost_usd } = req.body;
      const { data, error } = await supabaseAdmin
        .from('system_pricing')
        .update({ margin_multiplier, base_cost_usd, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();
        
      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    return res.status(405).end();
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
