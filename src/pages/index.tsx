import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase-client';

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    const checkUserRoleAndRoute = async (session: any) => {
      // Query the database to check if this user is the Admin
      const { data: userRecord } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (userRecord?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/chat');
      }
    };

    // 1. Listen for the Google ?code= exchange completing in the background
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        checkUserRoleAndRoute(session);
      }
    });

    // 2. Fallback check: If they land here and are already logged in or not logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && !window.location.href.includes('code=')) {
        router.push('/login');
      } else if (session) {
        checkUserRoleAndRoute(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white font-sans">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-gray-400 font-medium tracking-wide">Establishing secure connection...</p>
    </div>
  );
}
