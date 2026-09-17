'use client';

import { useState } from 'react';
import { initials } from '@/lib/format.js';
import { del, patch, post } from './api.js';
import Sheet from './Sheet.js';

/**
 * Settings and staff, in a sheet rather than a page of their own.
 *
 * There are no roles: anyone signed in can add anyone else. That is a decision,
 * not an omission — a venue this size has no information one member of staff
 * should be kept from, and guessing at a permission model before a real need
 * appears is how you end up maintaining the wrong one.
 */
export default function SettingsSheet({ settings, users, onClose, onChanged }) {
  const [target, setTarget] = useState(settings.targetOpenDate ?? '');
  const [rate, setRate] = useState(String(settings.vatRateBp / 100));
  const [staff, setStaff] = useState({ username: '', displayName: '', pin: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (work) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await onChanged();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      {error && <p className="notice" style={{ marginBottom: '0.85rem' }}>{error}</p>}

      <label className="field">
        <span className="field__label">Opening day</span>
        <input
          className="input"
          type="date"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <span className="field__hint">
          Provisional is fine. Leave it empty and the top of the board counts what is still in the
          way instead of counting down.
        </span>
      </label>

      <label className="field">
        <span className="field__label">VAT rate</span>
        <input
          className="input"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <span className="field__hint">
          Per cent. Changing it decides what the next payment means — every payment already recorded
          keeps the rate it was charged at.
        </span>
      </label>

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={busy}
        onClick={() => run(() => patch('/api/settings', {
          targetOpenDate: target || null,
          vatRateBp: Math.round(Number(rate) * 100),
        }))}
      >
        {busy ? 'Saving…' : 'Save settings'}
      </button>

      <section className="sheet__section">
        <h3 className="budget__label" style={{ marginBottom: '0.6rem' }}>Who can get in</h3>

        <ul className="ledger">
          {users.map((user) => (
            <li key={user.id} className="ledger__row">
              <span className="whoami" style={{ minWidth: '2.25rem', minHeight: '2.25rem' }}>
                {initials(user.displayName)}
              </span>
              <span>
                {user.displayName}
                <br />
                <span className="ledger__vat">@{user.username}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="row-2" style={{ marginTop: '0.9rem' }}>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              value={staff.displayName}
              onChange={(e) => setStaff({ ...staff, displayName: e.target.value })}
              placeholder="Maya"
            />
          </label>
          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="input"
              value={staff.username}
              onChange={(e) => setStaff({ ...staff, username: e.target.value.toLowerCase() })}
              placeholder="maya"
            />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Their PIN</span>
          <input
            className="input"
            inputMode="numeric"
            value={staff.pin}
            onChange={(e) => setStaff({ ...staff, pin: e.target.value })}
            placeholder="At least six digits"
          />
          <span className="field__hint">
            You are choosing it for them, so pick something they can change the meaning of by telling
            you a new one. Six digits minimum.
          </span>
        </label>

        <button
          type="button"
          className="btn btn--block"
          disabled={busy || !staff.username || !staff.pin}
          onClick={() => run(async () => {
            await post('/api/users', staff);
            setStaff({ username: '', displayName: '', pin: '' });
          })}
        >
          Add them
        </button>
      </section>

      <section className="sheet__section">
        <button
          type="button"
          className="btn btn--danger btn--block"
          disabled={busy}
          onClick={() => run(async () => {
            await del('/api/auth');
            window.location.href = '/unlock';
          })}
        >
          Sign out
        </button>
      </section>
    </Sheet>
  );
}
