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
/**
 * Never let a secret out of this endpoint.
 *
 * The first version of this probe returned the driver's error message verbatim,
 * and the very first real failure was `Headers.set: "<the key>" is an invalid
 * header value` — which printed the service role key on a public URL. An error
 * message is attacker-influenced data that routinely quotes the input that
 * caused it, so the only safe rule is to strip the known secrets out of it
 * rather than to reason about which messages are safe.
 *
 * The configured values are removed first, which catches the exact case above
 * even when the stored value is mangled, and key-shaped tokens are stripped
 * afterwards in case a secret arrives here by some route this file does not
 * know about.
 */
function redact(message) {
  let out = String(message ?? '');

  for (const secret of [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.PALETTE_SECRET,
    process.env.PALETTE_BOOTSTRAP_KEY,
  ]) {
    if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  }

  // Key-shaped tokens, including ones broken across lines by a bad paste.
  out = out.replace(/sb_(secret|publishable)_[A-Za-z0-9_\-\s]{4,}/g, 'sb_$1_[redacted]');
  out = out.replace(/eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/g, '[redacted-jwt]');

  return out.slice(0, 200);
}

function classify(error) {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '');

  // A stray newline or space inside the key lands here: the value never reaches
  // the network at all, because it cannot be put in an HTTP header.
  if (message.includes('invalid header value') || message.includes('headers.set')) {
    return 'key-malformed';
  }

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
            // The database's own words, with every known secret stripped out.
            detail: redact(error.message),
          }
        : { checked: true, ok: true };
    } catch (error) {
      database = {
        checked: true,
        ok: false,
        reason: classify(error),
        detail: redact(error?.message),
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
