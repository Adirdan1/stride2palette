'use client';

import { useState } from 'react';
import { directionOf, ownedBy, unowned } from '@/lib/core.js';
import { plural } from '@/lib/format.js';
import Screen from './Screen.js';
import TaskList from './TaskList.js';

/**
 * The board divided by who is carrying what.
 *
 * Tapping somebody opens their work underneath them rather than navigating to
 * a page of their own. Comparing two people's loads was the point of this
 * screen and it used to cost two page transitions and a back button; now the
 * summaries stay on screen while the detail opens between them.
 *
 * The list that opens is the same TaskList every domain page is built from, so
 * a task behaves identically here — steps open, ⋯ edits, ticking asks how it
 * went. Only adding is missing, and deliberately: a task added from here would
 * have no domain, and a task with no domain does not appear on any of the six
 * pages people actually work from.
 */
export default function PeopleScreen({
  people, items, subtasks, payments, spend, me, domains, openByDomain, settings, users, today,
}) {
  const [open, setOpen] = useState(() => new Set());

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const list = (theirs) => (
    <div className="person__work">
      <TaskList
        items={theirs}
        allItems={items}
        subtasks={subtasks}
        payments={payments}
        users={users}
        domains={domains}
        settings={settings}
        today={today}
        spend={spend}
        me={me}
        canAdd={false}
        compact
      />
    </div>
  );

  return (
    <Screen me={me} domains={domains} openByDomain={openByDomain} settings={settings} users={users}>
      <section className="band" style={{ marginTop: '0.25rem' }}>
        <div className="band__head">
          <h1 className="sheet__title">Who is on what</h1>
        </div>

        <ul className="band__list">
          {people.people.map(({ user, total, done, open: theirOpen, overdue }) => {
            const shown = open.has(user.id);
            const dir = directionOf(user.displayName);

            return (
              <li key={user.id}>
                <button
                  type="button"
                  className="person"
                  aria-expanded={shown}
                  dir={dir}
                  onClick={() => toggle(user.id)}
                >
                  <div className="person__body">
                    <p className="person__name">
                      {user.displayName}
                      <span className="caret" aria-hidden="true">
                        {shown ? '▾' : dir === 'rtl' ? '◂' : '▸'}
                      </span>
                    </p>
                    <div className="person__bar" role="img" aria-label={`${done} of ${total} done`}>
                      <div
                        className="person__fill"
                        style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
                      />
                    </div>
                    {/* The row is RTL for the name; this line is English
                        chrome that opens with a number, and a leading digit in
                        an RTL paragraph gets moved to the far end — "0 of 3
                        done" rendered as "of 3 done 0". It states its own. */}
                    <p className="person__meta" dir="ltr">
                      {done} of {total} done · {theirOpen} open
                      {overdue > 0 && <> · <span className="due--overdue">{overdue} overdue</span></>}
                    </p>
                  </div>
                </button>

                {shown && list(ownedBy(items, user.id))}
              </li>
            );
          })}

          {people.unassigned.total > 0 && (
            <li>
              <button
                type="button"
                className="person"
                aria-expanded={open.has('unassigned')}
                onClick={() => toggle('unassigned')}
              >
                <div className="person__body">
                  <p className="person__name" style={{ color: 'var(--ink-3)' }}>
                    Nobody yet
                    <span className="caret" aria-hidden="true">
                      {open.has('unassigned') ? '▾' : '▸'}
                    </span>
                  </p>
                  <p className="person__meta" dir="ltr">
                    {plural(people.unassigned.open, 'task')} with no owner
                  </p>
                </div>
              </button>

              {open.has('unassigned') && list(unowned(items))}
            </li>
          )}
        </ul>
      </section>
    </Screen>
  );
}
