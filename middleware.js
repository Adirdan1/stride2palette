import { NextResponse } from 'next/server';
import { SESSION_COOKIE, USER_HEADER, verifySession } from './lib/auth.js';

/**
 * Everything is behind the gate except these.
 *
 * /api/auth is how you get a cookie in the first place, /api/bootstrap creates
 * the very first account (and refuses once one exists), and /unlock is where you
 * type the PIN.
 *
 * /api/health is public deliberately. It reports only whether each environment
 * variable is *present*, never what it holds, and gating it creates a catch-22
 * on a bad deploy: the unlock page tells you to check it precisely when the
 * database is unreachable, which is exactly when nobody can sign in to look.
 */
const PUBLIC_PATHS = new Set(['/unlock', '/api/auth', '/api/bootstrap', '/api/health']);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Strip first, and on every path including the public ones. A forged header on
  // /api/auth would otherwise still be sitting there when the route ran.
  const headers = new Headers(request.headers);
  headers.delete(USER_HEADER);

  const pass = () => NextResponse.next({ request: { headers } });

  if (PUBLIC_PATHS.has(pathname)) return pass();

  const secret = process.env.PALETTE_SECRET;
  const isApi = pathname.startsWith('/api/');

  // Fail closed. An unset secret in production is a misconfiguration, and leaving
  // the venue's finances open is exactly the thing this gate exists to prevent.
  // Development is left open so `npm run dev` needs no setup.
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') return pass();
    const message = 'PALETTE_SECRET is not set, so the app is sealed. Set it and redeploy.';
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503, headers: { 'content-type': 'text/plain' } });
  }

  const userId = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret);

  if (userId) {
    headers.set(USER_HEADER, userId);
    return pass();
  }

  if (isApi) return NextResponse.json({ error: 'locked' }, { status: 401 });

  const unlock = new URL('/unlock', request.url);
  // Come back to whatever was being asked for.
  if (pathname !== '/') unlock.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: [
    // Everything except Next's own assets and the icons the manifest needs before
    // anyone has unlocked anything.
    '/((?!_next/static|_next/image|icons/|manifest.json|favicon.ico).*)',
  ],
};
