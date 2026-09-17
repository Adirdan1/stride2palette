/**
 * The gate.
 *
 * Unlike Stride, this app has more than one person in it, so there is a `users`
 * table and a `sessions` table — following stride2mortgage, which is the house
 * pattern for multi-user apps in the collection. A username and a PIN, hashed.
 *
 * The division of labour matters and is easy to get wrong:
 *
 *   - **The cookie is self-verifying.** It carries the user id and an HMAC, so
 *     `middleware.js` can check it with no database call at all. Middleware runs
 *     on the edge in front of every single request; a session lookup there would
 *     put a round trip on the critical path of the whole app.
 *   - **The `sessions` row is for revocation and last-seen.** It is checked in
 *     routes, where a round trip is already being paid for. The token is stored
 *     hashed, so the table is a set of revocable references rather than a set of
 *     live keys somebody could walk off with.
 *
 * Everything here uses Web Crypto rather than node:crypto, because middleware
 * runs on the edge runtime where node:crypto does not exist.
 */

const encoder = new TextEncoder();

export const SESSION_COOKIE = 'palette_session';

/**
 * Thirty days, where Stride uses a year.
 *
 * Stride is one person's phone and the worst case for a long cookie is that same
 * person staying signed in. This app holds a business's finances and has staff in
 * it, so the worst case is a device that left with somebody. Thirty days is the
 * compromise: nobody is asked weekly, and nothing outlives a month on its own.
 * Revoking sooner is what the `sessions` table is for.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * PBKDF2 rather than a bare digest, because a PIN is six digits and a bare
 * SHA-256 of the whole six-digit keyspace is computed in well under a second.
 * The work factor is what makes a stolen `pin_hash` column worth less than the
 * PINs in it.
 */
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';

function base64url(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

/**
 * Compare without leaking where the difference is via timing.
 *
 * Only ever called on two values of the same fixed length — digests or HMACs —
 * so the early length check cannot leak anything about the secret itself.
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// PINs
// ---------------------------------------------------------------------------

async function pbkdf2(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    key,
    256,
  );
  return base64url(bits);
}

/** `pbkdf2$<iterations>$<salt>$<hash>`. Self-describing, so the work factor can
 *  be raised later without invalidating every existing PIN. */
export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${base64url(salt)}$${hash}`;
}

export async function verifyPin(pin, stored) {
  if (typeof pin !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) return false;

  let salt;
  try {
    salt = fromBase64url(parts[2]);
  } catch {
    return false;
  }

  return timingSafeEqual(await pbkdf2(pin, salt, iterations), parts[3]);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * `<userId>.<issuedAt>.<signature>`.
 *
 * The signature covers both the id and the timestamp together, so neither can be
 * swapped for another session's without invalidating it. The cookie carries no
 * secret — only proof of one.
 */
export async function issueSession(userId, secret, now = Date.now()) {
  const payload = `${userId}.${now}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

/**
 * Returns the user id the token is good for, or null.
 *
 * Returning the id rather than a boolean is what lets middleware pass identity
 * downstream without a lookup: it forwards the verified id as a request header,
 * and routes read that instead of re-parsing the cookie.
 */
export async function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return null;

  const split = token.lastIndexOf('.');
  if (split <= 0) return null;

  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  if (!timingSafeEqual(signature, await hmac(payload, secret))) return null;

  const divider = payload.lastIndexOf('.');
  if (divider <= 0) return null;

  const userId = payload.slice(0, divider);
  const issued = Number(payload.slice(divider + 1));
  if (!Number.isFinite(issued)) return null;

  const age = now - issued;
  if (age < 0 || age >= SESSION_MAX_AGE * 1000) return null;

  return userId;
}

/** What goes in `sessions.token_hash`. The token itself is never stored. */
export async function hashSessionToken(token) {
  return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(String(token))));
}
