import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // --- VERCEL/BROWSER CACHE KILLER ---
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // -----------------------------------

  // In a production environment, verify the user making this request has role = 'admin' here.
  
  if (req.method === 'GET') {
    try {
      // Join to get the email for display
      const { data, error } = await supabaseAdmin
        .from('users_wallet')
        .select(`
          id, user_id, balance_inr, monthly_credit_limit_inr, margin_multiplier, is_blocked,
          users ( email )
        `);
      
      if (error) throw error;
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch wallets' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { wallet_id, monthly_credit_limit_inr, margin_multiplier, is_blocked } = req.body;
      
      const { data, error } = await supabaseAdmin
        .from('users_wallet')
        .update({ 
          monthly_credit_limit_inr, 
          margin_multiplier, 
          is_blocked,
          updated_at: new Date().toISOString()
        })
        .eq('id', wallet_id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update wallet' });
    }
  }

  res.setHeader('Allow', ['GET', 'PATCH']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
