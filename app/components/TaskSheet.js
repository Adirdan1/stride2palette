'use client';

import { useEffect, useRef, useState } from 'react';
import { canComplete, lockState, subtaskProgress, vatSplit } from '@/lib/core.js';
import { shekels, shortDate, signedShekels } from '@/lib/format.js';
import { del, patch, post } from './api.js';
import Ring from './Ring.js';
import Sheet from './Sheet.js';
import TaskForm, { toForm } from './TaskForm.js';

/** Well inside the sixty-second lease, so a slow request never drops it. */
const REFRESH_MS = 20_000;

/**
 * Editing one task: its fields, its steps, and the money against it.
 *
 * Opening the sheet claims the task. While it is open the lease is refreshed on
 * a timer, and closing it hands the task back rather than making everyone wait
 * out the minute. If somebody else already holds it the form renders read-only
 * and says who — and the server refuses the write regardless, because a
 * disabled form is a courtesy and not a guarantee.
 */
export default function TaskSheet({
  item, users, domains, payments, steps, today, vatRateBp, viewerId, onClose, onChanged,
}) {
  const [form, setForm] = useState(() => toForm(item));
  const [paid, setPaid] = useState({ gross: '', paidOn: today, note: '' });
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(null); // null = still asking

  const lock = lockState(item, viewerId);
  const holder = users.find((user) => user.id === lock.holderId);
  const editor = users.find((user) => user.id === item.lastEditor);
  const readOnly = held === false || (lock.locked && !lock.mine);

  const mine = payments.filter((payment) => payment.itemId === item.id);
  const spent = mine.reduce((total, payment) => total + payment.gross, 0);
  const progress = subtaskProgress(steps);

  // Claim on open, refresh while open, release on close.
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    let timer = null;
    let alive = true;

    const claim = async () => {
      try {
        const result = await post(`/api/items/${item.id}/lock`);
        if (alive) setHeld(result.held);
      } catch {
        // A failed claim is not a failed edit — the server checks again on the
        // write itself, so the worst case is a read-only form that need not be.
        if (alive) setHeld(false);
      }
    };

    claim();
    timer = setInterval(claim, REFRESH_MS);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      // Fire and forget: the page is going away and the lease expires anyway.
      del(`/api/items/${item.id}/lock`).catch(() => {});
    };
  }, [item.id]);

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

  const save = () => run(async () => {
    await patch(`/api/items/${item.id}`, {
      ...form,
      planned: form.planned === '' ? 0 : form.planned,
      due: form.due || null,
      ownerId: form.ownerId || null,
    });
    onClose();
  });

  const blocked = form.status === 'done' && !canComplete(form);

  return (
    <Sheet title={item.title} onClose={onClose}>
      {readOnly && (
        <p className="lockbar">
          <span className="lockbar__dot" aria-hidden="true" />
          {holder ? `${holder.displayName} is editing this right now.` : 'Somebody else is editing this right now.'}
        </p>
      )}

      {error && <p className="notice" style={{ marginBottom: '0.85rem' }}>{error}</p>}

      <TaskForm value={form} users={users} domains={domains} onChange={setForm} disabled={readOnly} />

      {blocked && (
        <p className="notice" style={{ marginBottom: '0.85rem' }}>
          Write what actually happened in the conclusion before marking this done.
        </p>
      )}

      <div className="sheet__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={save}
          disabled={busy || readOnly || blocked}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {mine.length === 0 && !readOnly && (
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy}
            onClick={() => run(async () => {
              await del(`/api/items/${item.id}`);
              onClose();
            })}
          >
            Delete
          </button>
        )}
      </div>

      {editor && (
        <p className="stamp">Last edited by {editor.displayName}.</p>
      )}

      <section className="sheet__section">
        <div className="budget__row">
          <span className="budget__label">Steps</span>
          <Ring done={progress.done} total={progress.total} />
        </div>

        {steps.length > 0 && (
          <ul className="ledger">
            {steps.map((sub) => (
              <li key={sub.id} className="ledger__row">
                <input
                  type="checkbox"
                  checked={sub.done}
                  disabled={busy || readOnly}
                  aria-label={sub.title}
                  onChange={(e) => run(() => patch(`/api/subtasks/${sub.id}`, { done: e.target.checked }))}
                  style={{ width: '1.15rem', height: '1.15rem', flexShrink: 0 }}
                />
                <span style={sub.done ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                  {sub.title}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ marginLeft: 'auto', minHeight: '2.75rem', padding: '0 0.5rem' }}
                    aria-label="Remove this step"
                    disabled={busy}
                    onClick={() => run(() => del(`/api/subtasks/${sub.id}`))}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
            <input
              className="input"
              value={step}
              onChange={(e) => setStep(e.target.value)}
              placeholder="Add a step"
            />
            <button
              type="button"
              className="btn"
              disabled={busy || !step.trim()}
              onClick={() => run(async () => {
                await post('/api/subtasks', { itemId: item.id, title: step });
                setStep('');
              })}
            >
              Add
            </button>
          </div>
        )}
      </section>

      <section className="sheet__section">
        <div className="budget__row">
          <span className="budget__label">Paid so far</span>
          <span className="budget__figure">{shekels(spent, { exact: true })}</span>
        </div>
        {item.planned > 0 && (
          <p className="field__hint" style={{ marginTop: '-0.3rem', marginBottom: '0.6rem' }}>
            Planned {shekels(item.planned)} · {signedShekels(spent - item.planned)}
          </p>
        )}

        {mine.length > 0 && (
          <ul className="ledger">
            {mine.map((payment) => {
              const split = vatSplit(payment.gross, payment.vatRateBp);
              return (
                <li key={payment.id} className="ledger__row">
                  <span>
                    <span className="ledger__when">{shortDate(payment.paidOn, today)}</span>
                    {payment.note && <> · {payment.note}</>}
                    <br />
                    <span className="ledger__vat">
                      {shekels(split.net, { exact: true })} net + {shekels(split.vat, { exact: true })} VAT
                    </span>
                  </span>
                  <span className={`ledger__amount ${payment.gross < 0 ? 'ledger__amount--refund' : ''}`}>
                    {shekels(payment.gross, { exact: true })}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ minHeight: '2.75rem', padding: '0 0.5rem' }}
                      aria-label="Remove this payment"
                      disabled={busy}
                      onClick={() => run(() => del(`/api/payments/${payment.id}`))}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!readOnly && (
          <>
            <div className="row-2" style={{ marginTop: '0.8rem' }}>
              <label className="field">
                <span className="field__label">Amount paid</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={paid.gross}
                  onChange={(e) => setPaid({ ...paid, gross: e.target.value })}
                  placeholder="₪0.00"
                />
              </label>
              <label className="field">
                <span className="field__label">When</span>
                <input
                  className="input"
                  type="date"
                  value={paid.paidOn}
                  onChange={(e) => setPaid({ ...paid, paidOn: e.target.value })}
                />
              </label>
            </div>

            <label className="field">
              <span className="field__label">What for</span>
              <input
                className="input"
                value={paid.note}
                onChange={(e) => setPaid({ ...paid, note: e.target.value })}
                placeholder="Deposit, balance, application fee"
              />
            </label>

            <p className="field__hint" style={{ marginBottom: '0.7rem' }}>
              Gross, as the invoice says. VAT is worked out at {(vatRateBp / 100).toFixed(0)}% and kept
              on the payment. A refund is a negative amount — “−250”.
            </p>

            <button
              type="button"
              className="btn btn--block"
              disabled={busy || !paid.gross}
              onClick={() => run(async () => {
                await post('/api/payments', { itemId: item.id, ...paid });
                setPaid({ gross: '', paidOn: today, note: '' });
              })}
            >
              Record payment
            </button>
          </>
        )}
      </section>
    </Sheet>
  );
}
