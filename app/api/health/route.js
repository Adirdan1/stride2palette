import { NextResponse } from 'next/server';
import { db } from '@/lib/db.js';

/**
 * Is the app up, is it configured, and can it actually reach its database?
 *
 * Public on purpose — see the note in middleware.js. It reports whether each
 * secret is *present*, never what it holds.
 *
 * It also runs a real query, because "the variable is set" and "the value is
 * right" are different questions and only the second one matters. Knowing a key
 * exists while the app still cannot read a table tells you nothing; knowing the
 * database answered `Invalid API key` tells you exactly what to fix. That gap
 * cost an evening on the first deploy of this app.
 *
 * The probe reads `settings`, which has exactly one row and no secrets in it.
 */
function classify(error) {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '');

  if (message.includes('api key') || message.includes('unauthorized') || code === '401') {
    return 'key-rejected';
  }
  if (message.includes('jwt') || message.includes('jws')) return 'key-malformed';
  if (code === '42p01' || message.includes('does not exist')) return 'schema-missing';
  if (message.includes('fetch failed') || message.includes('enotfound') || message.includes('getaddrinfo')) {
    return 'url-unreachable';
  }
  return 'other';
}

export async function GET() {
  const configured = {
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    secret: Boolean(process.env.PALETTE_SECRET),
    bootstrap: Boolean(process.env.PALETTE_BOOTSTRAP_KEY),
  };

  let database = { checked: false, reason: 'not-configured' };

  if (configured.supabase) {
    try {
      const { error } = await db().from('settings').select('id', { head: true, count: 'exact' });
      database = error
        ? {
            checked: true,
            ok: false,
            reason: classify(error),
            // The database's own words, truncated. A rejected key says so
            // plainly, and nothing here is secret.
            detail: String(error.message ?? '').slice(0, 200),
          }
        : { checked: true, ok: true };
    } catch (error) {
      database = {
        checked: true,
        ok: false,
        reason: classify(error),
        detail: String(error?.message ?? '').slice(0, 200),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    configured,
    database,
    // The host only. It is a public API endpoint that ships in every
    // browser-side Supabase app, and seeing it is how you catch a typo'd or
    // wrong-project URL without anybody reading the key.
    supabaseHost: (() => {
      try {
        return new URL(process.env.SUPABASE_URL).host;
      } catch {
        return null;
      }
    })(),
  });
}
