import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;

  if (code) {
    // This securely translates the Google code into Next.js Cookies
    const supabase = createPagesServerClient({ req, res });
    const { error } = await supabase.auth.exchangeCodeForSession(String(code));
    
    if (!error) {
      // Look up the user's role directly from the DB
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userRecord } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        // Route Super Admins to the Control Plane
        if (userRecord?.role === 'admin') {
          return res.redirect('/admin');
        }
      }
    }
  }
  
  // Default routing for standard users
  res.redirect('/chat');
}
