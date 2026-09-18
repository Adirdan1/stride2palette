import { notFound } from 'next/navigation';
import { inDomain } from '@/lib/core.js';
import { pageData } from '@/lib/pages.js';
import TaskListScreen from '../../components/TaskListScreen.js';

export const dynamic = 'force-dynamic';

export default async function Page({ params }) {
  const { domain } = await params;
  const data = await pageData();

  const found = data.domains.find((row) => row.key === domain);
  if (!found) notFound();

  return (
    <TaskListScreen
      title={found.label}
      heading={found.label}
      items={inDomain(data.items, found.key)}
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
      // A task added from the Kitchen page is a kitchen task unless somebody
      // says otherwise.
      presetDomain={found.key}
    />
  );
}
