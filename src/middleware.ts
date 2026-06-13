// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Define the routes that need protection
const ADMIN_PATHS = ['/admin'];
const API_PATHS = ['/api/chat', '/api/git', '/api/sandbox'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = API_PATHS.some(path => pathname.startsWith(path));
  const isAdminRoute = ADMIN_PATHS.some(path => pathname.startsWith(path));

  // Skip middleware for public routes and auth callbacks
  if (!isApiRoute && !isAdminRoute) {
    return NextResponse.next();
  }

  // Initialize Supabase client for Edge Runtime
  // FIX: We explicitly pass the native Edge fetch to bypass Node.js API warnings
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
      },
      global: {
        fetch: (...args) => fetch(...args),
      },
    }
  );

  // Extract JWT from Authorization header (API) or cookies (Web)
  const token = req.headers.get('authorization')?.split(' ')[1] || req.cookies.get('sb-access-token')?.value;

  if (!token) {
    return isApiRoute 
      ? NextResponse.json({ success: false, error: 'missing authorization token' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', req.url));
  }

  // Verify the JWT token
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return isApiRoute
      ? NextResponse.json({ success: false, error: 'invalid or expired token' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', req.url));
  }

  // Admin Route Protection (The Trap)
  if (isAdminRoute) {
    // Check custom claims or fetch role from public.users
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      // Kick unauthorized users back to the chat interface
      return NextResponse.redirect(new URL('/chat', req.url));
    }
  }

  // Pass the user ID down to the API routes via headers for trusted execution
  const response = NextResponse.next();
  response.headers.set('x-user-id', user.id);
  
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
