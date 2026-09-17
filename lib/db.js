import { createClient } from '@supabase/supabase-js';

/**
 * The Supabase client, server-side only.
 *
 * Built lazily rather than at module scope so that `next build` — which imports
 * every route module without any environment to speak of — does not fall over.
 * A missing key becomes a runtime error on the first request instead, where it
 * is actually actionable.
 *
 * This app has its own Supabase project rather than a schema inside the shared
 * one, so there is no `db: { schema }` option here. That is deliberate and the
 * reasoning is in the skill file: it is the first app in the collection where
 * more than one person logs in, and a service role key that also reads four
 * other apps' tables is a worse trade once staff hold it.
 */
let client = null;

export function db() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. See .env.example.');
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-palette': 'server' } },
  });

  return client;
}

export function timezone() {
  return process.env.PALETTE_TIMEZONE || 'Asia/Jerusalem';
}
