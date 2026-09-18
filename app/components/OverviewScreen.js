'use client';

import { plural, shekels, shortDate } from '@/lib/format.js';
import Mark from './Mark.js';
import Screen from './Screen.js';

function Hero({ hero, today }) {
  const clean = hero.kind === 'remaining';
  const unit = {
    remaining: `${plural(hero.open, 'thing')} still in the way`,
    countdown: `${plural(hero.days, 'day')} until you open`,
    today: 'You open today',
    overdue: `${plural(hero.days, 'day')} past the date you set`,
  }[hero.kind];

  return (
    <section className={`hero ${hero.kind === 'today' ? 'hero--open' : ''} ${hero.kind === 'overdue' ? 'hero--late' : ''}`}>
      <Mark shut={clean} className="mark--hero" />
      <p className="hero__eyebrow">{clean ? 'Before you open' : 'Opening day'}</p>
      <p className="hero__figure">{hero.kind === 'today' ? 'Today' : clean ? hero.open : hero.days}</p>
      <p className="hero__unit">{unit}</p>
      <p className="hero__meta">
        {clean
          ? 'Set an opening day in settings and this counts down instead.'
          : shortDate(hero.target, today)}
      </p>
    </section>
  );
}

/**
 * The overview answers two questions and refuses the rest: who is carrying what,
 * and what this is going to cost.
 *
 * No task list here on purpose. The moment it shows tasks it becomes a seventh
 * board, and the reason to open it stops being obvious.
 */
export default function OverviewScreen({ stats, today, me, domains, openByDomain, settings, users }) {
  const { work, money, people } = stats;

  return (
    <Screen me={me} domains={domains} openByDomain={openByDomain} settings={settings} users={users}>
      <Hero hero={stats.hero} today={today} />

      <div className="tiles">
        <div className="tile tile--done">
          <p className="tile__figure">{work.done}</p>
          <p className="tile__label">Done</p>
        </div>
        <div className="tile">
          <p className="tile__figure">{work.open}</p>
          <p className="tile__label">Open</p>
        </div>
        <div className={`tile ${work.overdue > 0 ? 'tile--overdue' : ''}`}>
          <p className="tile__figure">{work.overdue}</p>
          <p className="tile__label">Overdue</p>
        </div>
      </div>

      <section className="band">
        <div className="band__head">
          <h2 className="band__title">Expected spend</h2>
        </div>
        <div className="tiles">
          <div className="tile">
            <p className="tile__figure">{shekels(money.expected)}</p>
            <p className="tile__label">Planned</p>
          </div>
          <div className="tile">
            <p className="tile__figure">{shekels(money.spent)}</p>
            <p className="tile__label">Spent</p>
          </div>
          <div className={`tile ${money.variance > 0 ? 'tile--overdue' : ''}`}>
            <p className="tile__figure">{shekels(money.remaining)}</p>
            <p className="tile__label">Still to pay</p>
          </div>
        </div>
        {money.variance > 0 && (
          <p className="field__hint" style={{ marginTop: '0.5rem' }}>
            {shekels(money.variance)} over what was planned.
          </p>
        )}
      </section>

      <section className="band">
        <div className="band__head">
          <h2 className="band__title">Who is carrying what</h2>
          <span className="band__count">{people.people.length}</span>
        </div>
        <ul className="band__list">
          {people.people.map(({ user, total, done, open, overdue }) => (
            <li key={user.id}>
              <div className="person">
                <div className="person__body">
                  <p className="person__name">{user.displayName}</p>
                  <div
                    className="person__bar"
                    role="img"
                    aria-label={`${done} of ${total} done`}
                  >
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
              </div>
            </li>
          ))}
          {people.unassigned.total > 0 && (
            <li>
              <div className="person">
                <div className="person__body">
                  <p className="person__name" style={{ color: 'var(--ink-3)' }}>Nobody yet</p>
                  <p className="person__meta">
                    {plural(people.unassigned.open, 'task')} with no owner
                  </p>
                </div>
              </div>
            </li>
          )}
        </ul>
      </section>
    </Screen>
  );
}
