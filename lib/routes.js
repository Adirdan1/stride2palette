import { NextResponse } from 'next/server';
import { USER_HEADER } from './auth.js';

/**
 * The small amount of ceremony every route shares.
 *
 * `currentUserId` trusts the header because middleware has already verified the
 * cookie's signature and stripped any incoming copy of it. That is the whole
 * point of the arrangement: the expensive check happens once, at the edge.
 */
export function currentUserId(request) {
  return request.headers.get(USER_HEADER) || null;
}

export const ok = (body = { ok: true }) => NextResponse.json(body);

export const bad = (message, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Wrap a handler so a thrown error becomes a 400 with its message rather than an
 * opaque 500. The messages here are written to be read by the person using the
 * app — repo.js's delete-with-payments error is the clearest example — so
 * swallowing them would throw away the useful half of the failure.
 */
export function handler(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (error) {
      return bad(error.message || 'Something went wrong', 400);
    }
  };
}

export async function body(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Expected a JSON body');
  }
}
