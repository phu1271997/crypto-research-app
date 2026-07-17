import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static resources, API login/logout routes, and root '/' (which will render landing page or app based on session)
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/api/debug-db' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') || // matches favicon.ico, logo images, etc.
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Check for the session cookie
  const authSession = request.cookies.get('auth_session');

  if (!authSession || authSession.value !== 'authenticated') {
    // Redirect unauthenticated requests to the login page
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// See "Matching Paths" in Next.js documentation
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication APIs)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
