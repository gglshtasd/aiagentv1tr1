import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
  const isChatRoute = req.nextUrl.pathname.startsWith('/chat');

  if (!session && (isAdminRoute || isChatRoute)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  if (session && isAdminRoute) {
  // Pull from secure environment variables
  if (session.user.email === process.env.MASTER_ADMIN_EMAIL) {
    return res; 
  }

    // Standard routing for everyone else
    const { data: userRecord, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (error || !userRecord || userRecord.role !== 'admin') {
      console.warn(`[MIDDLEWARE] Blocked unauthorized admin access for: ${session.user.email}`);
      const redirectUrl = new URL('/chat', req.url);
      redirectUrl.searchParams.set('error', 'unauthorized_admin');
      return NextResponse.redirect(redirectUrl);
    }
  }

  return res;
}

export const config = {
  matcher: ['/chat/:path*', '/admin/:path*', '/login'],
};
