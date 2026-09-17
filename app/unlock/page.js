import { countUsers } from '@/lib/repo.js';
import UnlockForm from '../components/UnlockForm.js';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Palette — unlock' };

/**
 * Whether this is a sign-in or the first-account setup is decided here, on the
 * server, by asking whether any account exists. The client is never trusted to
 * say which mode it is in — the bootstrap endpoint checks the same thing again
 * for itself.
 */
export default async function UnlockPage({ searchParams }) {
  const { next } = await searchParams;

  let setup = false;
  let unreachable = false;
  try {
    setup = (await countUsers()) === 0;
  } catch {
    // Almost always a missing or wrong Supabase variable on a fresh deploy.
    // Saying so beats a stack trace, and /api/health says which one.
    unreachable = true;
  }

  if (unreachable) {
    return (
      <main className="unlock">
        <h1 className="unlock__title">Palette<span className="brand__mark">.</span></h1>
        <p className="unlock__blurb">
          The app is up but cannot reach its database. Check SUPABASE_URL and
          SUPABASE_SERVICE_ROLE_KEY in the deployment’s environment variables —
          <code> /api/health</code> will tell you which one is missing.
        </p>
      </main>
    );
  }

  return <UnlockForm setup={setup} next={typeof next === 'string' ? next : '/'} />;
}
