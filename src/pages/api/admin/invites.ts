import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) } }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Global Cache-Killer for Admin Routes
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('invite_codes').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { max_uses } = req.body;
    // Generate a secure, hacker-style code (e.g., MAST-A1B2C3D4)
    const code = 'MAST-' + randomBytes(4).toString('hex').toUpperCase();
    
    const { data, error } = await supabaseAdmin.from('invite_codes').insert({
      code,
      max_uses: max_uses || 1,
      times_used: 0,
      is_active: true
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }
  
  if (req.method === 'PATCH') {
    const { id, is_active } = req.body;
    const { data, error } = await supabaseAdmin.from('invite_codes').update({ is_active }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.status(405).end();
}
