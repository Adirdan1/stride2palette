'use client';

import { plural, shekels, shortDate } from '@/lib/format.js';
import Mark from './Mark.js';
import Screen, { useSettingsSheet } from './Screen.js';

/**
 * No opening day, said loudly.
 *
 * The quiet version of this — the count of open work, with a grey line offering
 * settings underneath — has been on screen since the app existed and the date
 * still is not set, which is all the evidence needed that a hint does not work.
 * Nothing else here can be judged without it: seventeen open tasks is either
 * comfortable or a crisis depending entirely on a date nobody has chosen.
 *
 * `--break` rather than the ragù accent, deliberately. The accent means *this is
 * the app*; the wine means *something is wrong*, it is the same red overdue work
 * uses, and in light it sits 2.27× darker than the accent so the two never read
 * as the same signal. Form carries it too, per the design system: a rule down
 * the leading edge and a tinted ground, so it still reads as an alert with the
 * colour taken away.
 */
function NoOpeningDay({ hero }) {
  const settings = useSettingsSheet();

  return (
    <section className="hero hero--alert" role="alert">
      <p className="hero__eyebrow hero__eyebrow--alert">Opening day</p>
      <p className="hero__figure hero__figure--alert">Not set</p>
      <p className="hero__unit">Nobody has chosen a date yet.</p>
      <p className="hero__meta">
        {plural(hero.open, 'thing')} still in the way, and no day to measure them against.
      </p>
      <button
        type="button"
        className="btn btn--alert"
        onClick={() => settings?.open('target')}
      >
        Set the opening day
      </button>
    </section>
  );
}

function Hero({ hero, today }) {
  if (hero.kind === 'remaining') return <NoOpeningDay hero={hero} />;

  const unit = {
    countdown: `${plural(hero.days, 'day')} until you open`,
    today: 'You open today',
    overdue: `${plural(hero.days, 'day')} past the date you set`,
  }[hero.kind];

  return (
    <section className={`hero ${hero.kind === 'today' ? 'hero--open' : ''} ${hero.kind === 'overdue' ? 'hero--late' : ''}`}>
      <Mark shut={false} className="mark--hero" />
      <p className="hero__eyebrow">Opening day</p>
      <p className="hero__figure">{hero.kind === 'today' ? 'Today' : hero.days}</p>
      <p className="hero__unit">{unit}</p>
      <p className="hero__meta">{shortDate(hero.target, today)}</p>
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
