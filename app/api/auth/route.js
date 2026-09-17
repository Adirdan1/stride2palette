import { NextResponse } from 'next/server';
import { isLockedOut } from '@/lib/core.js';
import { SESSION_COOKIE, SESSION_MAX_AGE, issueSession, verifyPin } from '@/lib/auth.js';
import {
  closeSession,
  findUserForSignIn,
  openSession,
  purgeExpiredSessions,
  recordSignInFailure,
  recordSignInSuccess,
} from '@/lib/repo.js';
import { bad, body, handler } from '@/lib/routes.js';

/**
 * Sign in.
 *
 * Every failure says the same thing, whether the username does not exist or the
 * PIN is wrong. Telling the two apart would let someone enumerate who works here
 * without ever guessing a PIN, and in a venue with four staff that is most of the
 * secret.
 *
 * The lockout is checked before the PIN is, so a locked account costs an attacker
 * the wait rather than a PBKDF2 round they could time.
 */
const REFUSED = 'That username and PIN do not match.';

export const POST = handler(async (request) => {
  const secret = process.env.PALETTE_SECRET;
  if (!secret) return bad('PALETTE_SECRET is not set, so nobody can sign in.', 503);

  const { username, pin, next } = await body(request);
  const user = await findUserForSignIn(String(username || '').trim().toLowerCase());

  // Still pay roughly the cost of a check when the user does not exist, so the
  // response time does not answer the question the message refuses to.
  if (!user) {
    await verifyPin(String(pin || ''), 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    return bad(REFUSED, 401);
  }

  if (isLockedOut(user)) {
    const until = new Date(user.lockedUntil);
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
    return bad(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 429);
  }

  if (!(await verifyPin(String(pin || ''), user.pinHash))) {
    await recordSignInFailure(user);
    return bad(REFUSED, 401);
  }

  const token = await issueSession(user.id, secret);
  await Promise.all([
    recordSignInSuccess(user.id),
    openSession(user.id, token),
    purgeExpiredSessions(),
  ]);

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, displayName: user.displayName },
    next: typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/',
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return response;
});

/** Sign out: drop the row so the token is revoked, and clear the cookie. */
export const DELETE = handler(async (request) => {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await closeSession(token);
    } catch {
      // The cookie is going regardless. A session row that could not be deleted
      // is untidy; a browser left holding a live cookie is a security problem.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
});
