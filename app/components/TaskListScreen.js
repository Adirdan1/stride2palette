'use client';

import { plural } from '@/lib/format.js';
import Screen from './Screen.js';
import TaskList from './TaskList.js';

/**
 * A whole page that is one list of tasks: every domain page, and the deep link
 * to one person's work.
 *
 * Thin on purpose. Everything that makes a list behave lives in TaskList, so
 * the people page can show the same lists without going through a page
 * transition to reach them, and a fix to a row lands in both places at once.
 */
export default function TaskListScreen({
  heading, items, allItems, subtasks, payments, users, domains, settings,
  today, spend, me, openByDomain, presetDomain,
}) {
  return (
    <Screen
      me={me}
      domains={domains}
      openByDomain={openByDomain}
      settings={settings}
      users={users}
    >
      <section className="band" style={{ marginTop: '0.25rem' }}>
        <div className="band__head">
          <h1 className="sheet__title" dir="auto">{heading}</h1>
          <span className="band__count">{plural(items.length, 'task')}</span>
        </div>
      </section>

      <TaskList
        items={items}
        allItems={allItems}
        subtasks={subtasks}
        payments={payments}
        users={users}
        domains={domains}
        settings={settings}
        today={today}
        spend={spend}
        me={me}
        presetDomain={presetDomain}
      />
    </Screen>
  );
}
