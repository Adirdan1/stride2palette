'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { plural, shekels, shortDate } from '@/lib/format.js';
import { del, post } from './api.js';
import FundChart from './FundChart.js';
import Screen from './Screen.js';

/**
 * The shared fund: who has put in what, what is in the pot, and how it got here.
 *
 * The balance is the hero, the per-person split answers "have I paid my share",
 * and the chart answers "are we getting there". Nothing on this page is stored —
 * every figure is the sum of the deposit rows, so a mistaken entry is corrected
 * by removing the row rather than by adjusting a total.
 */
export default function FundScreen({ fund, deposits, users, today, me, domains, openByDomain, settings }) {
  const router = useRouter();
  const [form, setForm] = useState({ userId: me?.id ?? '', amount: '', depositedOn: today, note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const byId = new Map(users.map((user) => [user.id, user]));

  const run = async (work) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await router.refresh();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen me={me} domains={domains} openByDomain={openByDomain} settings={settings} users={users}>
      <section className="hero">
        <p className="hero__eyebrow">In the pot</p>
        <p className="hero__figure">{shekels(fund.balance)}</p>
        {fund.target > 0 ? (
          <>
            <p className="hero__unit">of {shekels(fund.target)}</p>
            <div className="budget__bar" style={{ marginTop: '0.8rem' }}>
              <div className="budget__fill" style={{ width: `${fund.fraction * 100}%` }} />
            </div>
            <p className="hero__meta">{shekels(fund.remaining)} to go</p>
          </>
        ) : (
          <p className="hero__meta">Set a target in settings to track progress towards it.</p>
        )}
      </section>

      <section className="band">
        <div className="band__head">
          <h2 className="band__title">How it has grown</h2>
        </div>
        <FundChart series={fund.series} target={fund.target} today={today} />
      </section>

      <section className="band">
        <div className="band__head">
          <h2 className="band__title">Who put in what</h2>
          <span className="band__count">{users.length}</span>
        </div>
        <ul className="band__list">
          {fund.people.map(({ user, total, count }) => (
            <li key={user.id}>
              <div className="person">
                <div className="person__body">
                  <p className="person__name">{user.displayName}</p>
                  <div
                    className="person__bar"
                    role="img"
                    aria-label={`${shekels(total)} of ${shekels(fund.balance)}`}
                  >
                    <div
                      className="person__fill"
                      style={{ width: `${fund.balance > 0 ? Math.max(0, (total / fund.balance) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="person__meta">
                    {shekels(total)} · {plural(count, 'deposit')}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="band">
        <div className="band__head">
          <h2 className="band__title">Record a deposit</h2>
        </div>

        {error && <p className="notice" style={{ marginBottom: '0.85rem' }}>{error}</p>}

        <label className="field">
          <span className="field__label">Who</span>
          <select
            className="input"
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
          >
            <option value="">Pick somebody</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName}</option>
            ))}
          </select>
        </label>

        <div className="row-2">
          <label className="field">
            <span className="field__label">Amount</span>
            <input
              className="input"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="₪0"
            />
          </label>
          <label className="field">
            <span className="field__label">When</span>
            <input
              className="input"
              type="date"
              value={form.depositedOn}
              onChange={(e) => setForm({ ...form, depositedOn: e.target.value })}
            />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Note</span>
          <input
            dir="auto"
            className="input"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Monthly, opening float, equipment"
          />
        </label>

        <p className="field__hint" style={{ marginBottom: '0.7rem' }}>
          A withdrawal is a negative amount — “−500”. Nothing is edited away, so the pot always
          shows what actually moved.
        </p>

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={busy || !form.userId || !form.amount}
          onClick={() => run(async () => {
            await post('/api/fund', form);
            setForm({ userId: me?.id ?? '', amount: '', depositedOn: today, note: '' });
          })}
        >
          {busy ? 'Recording…' : 'Record it'}
        </button>
      </section>

      {deposits.length > 0 && (
        <section className="band">
          <div className="band__head">
            <h2 className="band__title">Every deposit</h2>
            <span className="band__count">{deposits.length}</span>
          </div>
          <ul className="ledger">
            {deposits.map((deposit) => (
              <li key={deposit.id} className="ledger__row">
                <span>
                  {byId.get(deposit.userId)?.displayName ?? 'Somebody'}
                  <br />
                  <span className="ledger__when">
                    {shortDate(deposit.depositedOn, today)}
                    {deposit.note && <> · <span dir="auto">{deposit.note}</span></>}
                  </span>
                </span>
                <span className={`ledger__amount ${deposit.amount < 0 ? 'ledger__amount--refund' : ''}`}>
                  {shekels(deposit.amount, { exact: true })}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ minHeight: '2.75rem', padding: '0 0.5rem' }}
                  aria-label="Remove this deposit"
                  disabled={busy}
                  onClick={() => run(() => del(`/api/fund/${deposit.id}`))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  );
}
