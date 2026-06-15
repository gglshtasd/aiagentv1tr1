import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase-client';

export default function IndexPage() {
  const router = useRouter();
  const isRouting = useRef(false);

  useEffect(() => {
    const checkUserRoleAndRoute = async (session: any) => {
      if (isRouting.current) return;
      isRouting.current = true;

      const { data: userRecord } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      router.replace(userRecord?.role === 'admin' ? '/admin' : '/chat');
    };

    // 1. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        checkUserRoleAndRoute(session);
      }
    });

    // 2. Fallback check for existing sessions
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && !window.location.href.includes('code=')) {
        if (!isRouting.current) {
          isRouting.current = true;
          router.replace('/login');
        }
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
