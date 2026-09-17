'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { plural, shekels, shortDate, signedShekels } from '@/lib/format.js';
import { post } from './api.js';
import ItemForm, { emptyItem } from './ItemForm.js';
import ItemRow from './ItemRow.js';
import ItemSheet from './ItemSheet.js';
import Mark from './Mark.js';
import PullToRefresh from './PullToRefresh.js';
import SettingsSheet from './SettingsSheet.js';
import Sheet from './Sheet.js';

const BAND_TITLES = {
  now: 'Now',
  next: 'Next',
  waiting: 'Waiting on them',
  someday: 'Someday',
  closed: 'Done',
};

const BAND_EMPTY = {
  now: 'Nothing needs you this fortnight.',
  next: 'Nothing scheduled further out.',
  waiting: 'Nothing sitting with anybody else.',
  someday: 'Nothing parked without a date.',
  closed: 'Nothing finished yet.',
};

/** The hero, and the one thing on the screen allowed to be biggest. */
function Hero({ hero, today }) {
  const shut = hero.kind === 'remaining';

  const figure = shut ? hero.open : hero.days;
  const unit = {
    remaining: plural(hero.open, 'thing') + ' still in the way',
    countdown: `${plural(hero.days, 'day')} until you open`,
    today: 'You open today',
    overdue: `${plural(hero.days, 'day')} past the date you set`,
  }[hero.kind];

  return (
    <section className={`hero ${hero.kind === 'today' ? 'hero--open' : ''} ${hero.kind === 'overdue' ? 'hero--late' : ''}`}>
      <Mark shut={shut} className="mark--hero" />
      <p className="hero__eyebrow">{shut ? 'Before you open' : 'Opening day'}</p>
      <p className="hero__figure">{hero.kind === 'today' ? 'Today' : figure}</p>
      <p className="hero__unit">{unit}</p>
      <p className="hero__meta">
        {shut
          ? 'Set an opening day in settings and this counts down instead.'
          : `${shortDate(hero.target, today)} · ${plural(hero.open, 'thing')} left`}
        {hero.overdue > 0 && <> · <span className="due--overdue">{hero.overdue} overdue</span></>}
      </p>
    </section>
  );
}

/** The spine again, horizontal. Over budget shows as an overrun, not a full bar. */
function Budget({ budget }) {
  const { planned, actual, variance } = budget;
  const scale = Math.max(planned, actual, 1);
  const fill = Math.max(0, Math.min(actual, planned)) / scale;
  const over = Math.max(0, actual - planned) / scale;

  return (
    <div className="budget">
      <div className="budget__row">
        <span className="budget__label">Spent so far</span>
        <span className="budget__figure">{shekels(actual)}</span>
      </div>
      <div
        className="budget__bar"
        role="img"
        aria-label={`${shekels(actual)} spent of ${shekels(planned)} planned`}
      >
        <div className="budget__fill" style={{ width: `${fill * 100}%` }} />
        {over > 0 && <div className="budget__over" style={{ width: `${over * 100}%` }} />}
      </div>
      <div className="budget__foot">
        <span>of {shekels(planned)} planned</span>
        <span className={variance > 0 ? 'budget__over-label' : 'budget__under-label'}>
          {planned === 0 ? '' : signedShekels(variance)}
        </span>
      </div>
    </div>
  );
}

export default function Board({ today, settings, users, bands, budget, hero, payments, spend, me }) {
  const router = useRouter();
  const [sheet, setSheet] = useState(null);
  const [draft, setDraft] = useState(emptyItem);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const byId = new Map(users.map((user) => [user.id, user]));
  const allItems = Object.values(bands).flat();
  const open = sheet?.kind === 'item' ? allItems.find((item) => item.id === sheet.id) : null;

  // A server component owns the data, so a write finishes by asking the server
  // to re-render rather than by patching a second copy of the truth in here.
  const refresh = async () => router.refresh();

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await post('/api/items', { ...draft, planned: draft.planned === '' ? 0 : draft.planned });
      setDraft(emptyItem());
      setSheet(null);
      await refresh();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell">
      {/* Pull down at the top to re-read the board. Every derived value is
          recomputed on the server, so this is also how a second person's edits
          reach your screen. */}
      <PullToRefresh />

      <header className="topbar">
        <span className="brand">
          Palette<span className="brand__mark">.</span>
        </span>
        <button
          type="button"
          className="whoami"
          onClick={() => setSheet({ kind: 'settings' })}
          aria-label="Settings and staff"
        >
          {me?.displayName ?? 'Settings'}
        </button>
      </header>

      <Hero hero={hero} today={today} />
      <Budget budget={budget} />

      {Object.keys(BAND_TITLES).map((band) => {
        const items = bands[band] ?? [];
        // Done collapses away entirely when empty rather than showing a prompt.
        // The other bands being empty is information; this one is just a new app.
        if (band === 'closed' && items.length === 0) return null;

        return (
          <section className="band" key={band}>
            <div className="band__head">
              <h2 className="band__title">{BAND_TITLES[band]}</h2>
              <span className="band__count">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="band__empty">{BAND_EMPTY[band]}</p>
            ) : (
              <ul className="band__list">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    today={today}
                    spent={spend[item.id] ?? 0}
                    owner={byId.get(item.ownerId)}
                    onOpen={(id) => setSheet({ kind: 'item', id })}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <button type="button" className="fab" onClick={() => setSheet({ kind: 'add' })}>
        + Add
      </button>

      {sheet?.kind === 'add' && (
        <Sheet title="Add to the board" onClose={() => setSheet(null)}>
          {error && <p className="notice" style={{ marginBottom: '0.85rem' }}>{error}</p>}
          <ItemForm value={draft} users={users} onChange={setDraft} />
          <div className="sheet__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={add}
              disabled={busy || !draft.title.trim()}
            >
              {busy ? 'Adding…' : 'Add it'}
            </button>
          </div>
        </Sheet>
      )}

      {open && (
        <ItemSheet
          item={open}
          users={users}
          payments={payments}
          today={today}
          vatRateBp={settings.vatRateBp}
          onClose={() => setSheet(null)}
          onChanged={refresh}
        />
      )}

      {sheet?.kind === 'settings' && (
        <SettingsSheet
          settings={settings}
          users={users}
          onClose={() => setSheet(null)}
          onChanged={refresh}
        />
      )}
    </main>
  );
}
