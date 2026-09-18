import { headers } from 'next/headers';
import { isOpen } from './core.js';
import { USER_HEADER } from './auth.js';
import { getUser, loadEverything } from './repo.js';

/**
 * What every page needs before it can render anything: the whole board, who is
 * looking at it, and the open-work counts the navigation shows.
 *
 * One function so the eight pages cannot disagree about any of it, and so the
 * nav counts are computed once from the same items the pages are listing.
 */
export async function pageData() {
  const board = await loadEverything();
  const me = await getUser((await headers()).get(USER_HEADER));

  const openByDomain = Object.fromEntries(
    board.domains.map((domain) => [
      domain.key,
      board.items.filter((item) => isOpen(item) && item.domains.includes(domain.key)).length,
    ]),
  );

  return {
    ...board,
    me,
    openByDomain,
    // A Map does not survive the trip to a client component.
    spend: Object.fromEntries(board.spend),
  };
}
