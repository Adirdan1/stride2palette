'use client';

import { useState } from 'react';
import Link from 'next/link';
import { plural } from '@/lib/format.js';
import Screen from './Screen.js';

/**
 * The board divided by who is carrying what.
 *
 * Each person is a link through to their own list rather than an accordion of
 * every task on one page: with four people and a launch's worth of work, a
 * single scrolling page stops being readable very quickly.
 */
export default function PeopleScreen({ people, me, domains, openByDomain, settings, users }) {
  return (
    <Screen title="People" me={me} domains={domains} openByDomain={openByDomain} settings={settings} users={users}>
      <section className="band" style={{ marginTop: '0.25rem' }}>
        <div className="band__head">
          <h1 className="sheet__title">Who is on what</h1>
        </div>
        <ul className="band__list">
          {people.people.map(({ user, total, done, open, overdue }) => (
            <li key={user.id}>
              <Link href={`/people/${user.username}`} className="person" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="person__body">
                  <p className="person__name">{user.displayName}</p>
                  <div className="person__bar" role="img" aria-label={`${done} of ${total} done`}>
                    <div
                      className="person__fill"
                      style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
                    />
                  </div>
                  <p className="person__meta">
                    {done} of {total} done · {open} open
                    {overdue > 0 && <> · <span className="due--overdue">{overdue} overdue</span></>}
                  </p>
                </div>
              </Link>
            </li>
          ))}
          {people.unassigned.total > 0 && (
            <li>
              <Link href="/people/unassigned" className="person" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="person__body">
                  <p className="person__name" style={{ color: 'var(--ink-3)' }}>Nobody yet</p>
                  <p className="person__meta">{plural(people.unassigned.open, 'task')} with no owner</p>
                </div>
              </Link>
            </li>
          )}
        </ul>
      </section>
    </Screen>
  );
}
