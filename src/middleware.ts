import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // Pass-through middleware. 
  // We rely entirely on React client-side routing and secure API endpoint validation to avoid Cookie/LocalStorage desync loops.
  return NextResponse.next();
}

export const config = {
  matcher: ['/chat/:path*', '/admin/:path*', '/login'],
};
