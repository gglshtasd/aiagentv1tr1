// src/middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  // Initialize Supabase specifically for Next.js Middleware
  const supabase = createMiddlewareClient({ req, res });

  // Refresh the session token if it is stale
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
  const isChatRoute = req.nextUrl.pathname.startsWith('/chat');

  // FAIL-SAFE 1: Not logged in? Boot to login page.
  if (!session && (isAdminRoute || isChatRoute)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // FAIL-SAFE 2: Logged in but trying to access the login page? Boot to chat.
  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  // FAIL-SAFE 3: Strict Admin Route Protection
  if (session && isAdminRoute) {
    // Actually query the DB to verify role, ignoring stale browser cookies
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (error || !profile || profile.role !== 'admin') {
      console.warn(`[MIDDLEWARE] Blocked unauthorized admin access for: ${session.user.email}`);
      
      // Kick back to chat with an error flag so the UI knows what happened
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
