import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  // Get token from cookies (Web) or header (API)
  const token = req.cookies.get('sb-access-token')?.value || req.headers.get('authorization')?.split(' ')[1];

  const isProtectedRoute = req.nextUrl.pathname.startsWith('/chat') || req.nextUrl.pathname.startsWith('/agents');
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');

  // 1. Kick unauthenticated users back to login
  if (!token && (isProtectedRoute || isAdminRoute)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 2. Protect Admin Panel (Decode JWT to check role)
  if (isAdminRoute && token) {
    try {
      const decoded = JSON.parse(atob(token.split('.')[1]));
      if (decoded.user_metadata?.role !== 'admin') {
        return NextResponse.redirect(new URL('/chat', req.url)); // Kick standard users to chat
      }
    } catch (e) {
      return NextResponse.redirect(new URL('/chat', req.url));
    }
  }

  return res;
}

// EXACT MATCHERS: Tell Next.js exactly which pages to protect
export const config = {
  matcher: ['/chat/:path*', '/admin/:path*', '/agents/:path*'],
};
