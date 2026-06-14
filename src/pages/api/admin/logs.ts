
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) } }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50); // Fetch last 50 events
      
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }
  res.status(405).end();
}
