import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Client-Side Hardware Data
    const { gpu_model, canvas_hash, cpu_cores, ram_gb } = req.body || {};

    // Vercel Edge Network Headers
    const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '127.0.0.1';
    const city = req.headers['x-vercel-ip-city'] || 'Unknown City';
    const country = req.headers['x-vercel-ip-country'] || 'Unknown Country';
    const user_agent = req.headers['user-agent'] || 'Unknown';

    // Format location
    const location = (city === 'Unknown City' && country === 'Unknown Country') 
      ? 'Local/Proxy' 
      : `${city}, ${country}`;

    await supabaseAdmin.from('login_activity').insert({
      user_id: user.id,
      email: user.email,
      ip_address: Array.isArray(ip) ? ip[0] : ip,
      user_agent: user_agent,
      location: location,
      gpu_model: gpu_model,
      canvas_hash: canvas_hash,
      cpu_cores: cpu_cores,
      ram_gb: ram_gb
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
