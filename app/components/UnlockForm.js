'use client';

import { useState } from 'react';
import { post } from './api.js';
import Mark from './Mark.js';

/**
 * The gate, in both its modes.
 *
 * `setup` is the very first account. The endpoint behind it refuses once any
 * account exists, so this form simply stops being reachable — there is no state
 * to clean up and no flag to remember to turn off.
 */
export default function UnlockForm({ setup, next }) {
  const [fields, setFields] = useState({ username: '', pin: '', key: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (patch) => setFields({ ...fields, ...patch });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (setup) {
        await post('/api/bootstrap', fields);
      }
      const result = await post('/api/auth', {
        username: fields.username,
        pin: fields.pin,
        next,
      });
      window.location.href = result.next || '/';
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <main className="unlock">
      <Mark shut className="unlock__mark" />
      <h1 className="unlock__title">
        Palette<span className="brand__mark">.</span>
      </h1>
      <p className="unlock__blurb">
        {setup
          ? 'Nobody has an account yet. Make the first one.'
          : 'Everything that has to happen before the doors open.'}
      </p>

      <form className="unlock__form" onSubmit={submit}>
        {error && <p className="notice">{error}</p>}

        {setup && (
          <label className="field">
            <span className="field__label">Setup key</span>
            <input
              className="input"
              type="password"
              value={fields.key}
              onChange={(e) => set({ key: e.target.value })}
              autoComplete="off"
            />
            <span className="field__hint">
              The PALETTE_BOOTSTRAP_KEY from the deployment’s environment variables.
            </span>
          </label>
        )}

        {setup && (
          <label className="field">
            <span className="field__label">Your name</span>
            <input
              className="input"
              value={fields.displayName}
              onChange={(e) => set({ displayName: e.target.value })}
              placeholder="Adir"
            />
          </label>
        )}

        <label className="field">
          <span className="field__label">Username</span>
          <input
            className="input"
            value={fields.username}
            onChange={(e) => set({ username: e.target.value.toLowerCase() })}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">PIN</span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            value={fields.pin}
            onChange={(e) => set({ pin: e.target.value })}
            autoComplete={setup ? 'new-password' : 'current-password'}
          />
          {setup && <span className="field__hint">Digits only, at least six of them.</span>}
        </label>

        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={busy || !fields.username || !fields.pin}
        >
          {busy ? 'One moment…' : setup ? 'Create the account' : 'Unlock'}
        </button>
      </form>
    </main>
  );
}
