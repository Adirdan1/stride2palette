import { getUser, loadBoard } from '@/lib/repo.js';
import { USER_HEADER } from '@/lib/auth.js';
import { headers } from 'next/headers';
import Board from './components/Board.js';

/**
 * The one screen.
 *
 * Every derived value on it — the bands, the budget, the countdown — is computed
 * by pure functions in core.js on this request. Nothing is cached and nothing is
 * stored, so a date rolling over or a payment landing changes the board on the
 * next read with no write and no cron.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const board = await loadBoard();
  const me = await getUser((await headers()).get(USER_HEADER));

  return (
    <Board
      today={board.today}
      settings={board.settings}
      users={board.users}
      bands={board.bands}
      budget={board.budget}
      hero={board.hero}
      payments={board.payments}
      // A Map does not survive the trip to a client component.
      spend={Object.fromEntries(board.spend)}
      me={me}
    />
  );
}
