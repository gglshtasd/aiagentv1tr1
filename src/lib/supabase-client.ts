import { createClient } from '@supabase/supabase-js';
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use createPagesBrowserClient on the frontend so auth sessions are stored in 
// Cookies instead of LocalStorage. Middleware ONLY reads cookies.
export const supabaseClient = typeof window !== 'undefined'
  ? createPagesBrowserClient()
  : createClient(supabaseUrl, supabaseAnonKey);
