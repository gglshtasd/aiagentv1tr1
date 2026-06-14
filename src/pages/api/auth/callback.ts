import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[API] === CALLBACK ROUTE HIT ===');
  console.log('[API] Query Parameters Received:', req.query);
  
  const { code } = req.query;

  if (code) {
    try {
      const supabase = createPagesServerClient({ req, res });
      console.log('[API] Exchanging Google code for secure session...');
      
      const { error } = await supabase.auth.exchangeCodeForSession(String(code));
      
      if (error) {
        console.error('[API] FATAL: Code Exchange Failed:', error.message);
        return res.redirect('/login?error=exchange_failed');
      }

      console.log('[API] Session created. Verifying user database role...');
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: userRecord, error: dbError } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (dbError) {
          console.error('[API] ERROR: Could not fetch user from users table:', dbError.message);
        }

        console.log(`[API] Target User Role: [${userRecord?.role?.toUpperCase() || 'NULL'}]`);
        
        if (userRecord?.role === 'admin') {
          console.log('[API] Super Admin verified. Routing to Control Plane.');
          return res.redirect('/admin');
        }
      }
    } catch (err) {
      console.error('[API] CATCH BLOCK EXCEPTION:', err);
    }
  } else {
    console.warn('[API] WARNING: No code found in URL. Google redirect failed.');
  }
  
  console.log('[API] Default user routing activated -> /chat');
  res.redirect('/chat');
}
