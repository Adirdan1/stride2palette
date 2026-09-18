import { overviewStats } from '@/lib/core.js';
import { pageData } from '@/lib/pages.js';
import OverviewScreen from './components/OverviewScreen.js';

/**
 * The overview.
 *
 * Every figure on it is derived by pure functions in core.js on this request.
 * Nothing is cached and nothing is stored, so a date rolling over or somebody
 * else ticking a step changes the numbers on the next read, with no write and
 * no cron.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const data = await pageData();

  return (
    <OverviewScreen
      stats={overviewStats(data.items, data.payments, data.users, data.settings, data.today)}
      today={data.today}
      me={data.me}
      domains={data.domains}
      openByDomain={data.openByDomain}
      settings={data.settings}
      users={data.users}
    />
  );
}
