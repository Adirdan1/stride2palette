import { summariseFund } from '@/lib/core.js';
import { pageData } from '@/lib/pages.js';
import FundScreen from '../components/FundScreen.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Palette — fund' };

export default async function Page() {
  const data = await pageData();

  return (
    <FundScreen
      fund={summariseFund(data.deposits, data.users, data.settings.fundTarget)}
      deposits={data.deposits}
      users={data.users}
      today={data.today}
      me={data.me}
      domains={data.domains}
      openByDomain={data.openByDomain}
      settings={data.settings}
    />
  );
}
