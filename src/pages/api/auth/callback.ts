import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;

  if (code) {
    const supabase = createPagesServerClient({ req, res });
    
    // 1. Exchange the secure Google code
    const { error } = await supabase.auth.exchangeCodeForSession(String(code));
    
    if (!error) {
      // 2. Extract the exact user data straight from Google
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // ==========================================
        // 🔥 THE ULTIMATE ADMIN BYPASS 🔥
        // ==========================================
        if (user.email === process.env.MASTER_ADMIN_EMAIL){
          console.log('[AUTH] Master Email detected. Forcing Super Admin privileges...');
          
          // Use the Service Role Key to ruthlessly overwrite the database
          const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!, 
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );

          await supabaseAdmin.from('users').upsert({
            id: user.id,
            email: user.email,
            role: 'admin',
            advanced_mode_enabled: true,
            monthly_credit_limit_inr: 999999
          });

          // Route immediately to the control plane
          return res.redirect('/admin');
        }

        // ==========================================
        // STANDARD USER ROUTING
        // ==========================================
        const { data: userRecord } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        
        if (userRecord?.role === 'admin') {
          return res.redirect('/admin');
        }
      }
    }
  }
  
  // Default fallback
  res.redirect('/chat');
}
