import { notFound } from 'next/navigation';
import { ownedBy, unowned } from '@/lib/core.js';
import { pageData } from '@/lib/pages.js';
import TaskListScreen from '../../components/TaskListScreen.js';

export const dynamic = 'force-dynamic';

export default async function Page({ params }) {
  const { who } = await params;
  const data = await pageData();

  // `unassigned` is a real destination, not a missing person: work nobody owns
  // is the most likely to be dropped, so it gets a page like everybody else.
  const person = who === 'unassigned' ? null : data.users.find((user) => user.username === who);
  if (who !== 'unassigned' && !person) notFound();

  const items = person ? ownedBy(data.items, person.id) : unowned(data.items);

  return (
    <TaskListScreen
      heading={person ? person.displayName : 'Nobody yet'}
      items={items}
      allItems={data.items}
      subtasks={data.subtasks}
      payments={data.payments}
      users={data.users}
      domains={data.domains}
      settings={data.settings}
      today={data.today}
      spend={data.spend}
      me={data.me}
      openByDomain={data.openByDomain}
    />
  );
}
