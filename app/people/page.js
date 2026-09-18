import { summarisePeople } from '@/lib/core.js';
import { pageData } from '@/lib/pages.js';
import PeopleScreen from '../components/PeopleScreen.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Palette — people' };

export default async function Page() {
  const data = await pageData();

  return (
    <PeopleScreen
      people={summarisePeople(data.items, data.users, data.today)}
      me={data.me}
      domains={data.domains}
      openByDomain={data.openByDomain}
      settings={data.settings}
      users={data.users}
    />
  );
}
