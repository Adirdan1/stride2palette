import { NextResponse } from 'next/server';

/**
 * Is the app up, and is it configured?
 *
 * Deliberately says whether each secret is *present*, never what it is. That is
 * enough to tell a bad deploy from a bad database without handing anything over:
 * the single most common failure when shipping one of these is a missing
 * environment variable, and guessing at it from a 503 is miserable.
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    configured: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      secret: Boolean(process.env.PALETTE_SECRET),
      bootstrap: Boolean(process.env.PALETTE_BOOTSTRAP_KEY),
    },
  });
}
