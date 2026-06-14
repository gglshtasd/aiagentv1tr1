import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;

  if (code) {
    const supabase = createPagesServerClient({ req, res });
    const { error } = await supabase.auth.exchangeCodeForSession(String(code));
    
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // 1. ==========================================
        // 🔥 SERVER-SIDE TELEMETRY LOGGER 🔥
        // ==========================================
        const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown IP';
        const userAgent = req.headers['user-agent'] || 'Unknown Device';

        // Bypasses all RLS to guarantee the log is saved
        await supabaseAdmin.from('login_activity').insert({
          user_id: user.id, email: user.email, ip_address: ip as string, user_agent: userAgent
        });

        // 2. ==========================================
        // MASTER ADMIN BYPASS
        // ==========================================
        if (user.email === process.env.MASTER_ADMIN_EMAIL || user.email === 'gglshtasd@gmail.com') {
          await supabaseAdmin.from('users').upsert({
            id: user.id, email: user.email, role: 'admin', advanced_mode_enabled: true, monthly_credit_limit_inr: 999999
          });
          return res.redirect('/admin');
        }

        // Standard Routing
        const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (userRecord?.role === 'admin') return res.redirect('/admin');
      }
    }
  }
  res.redirect('/chat');
}
