'use client';

import { useState } from 'react';
import { vatSplit } from '@/lib/core.js';
import { shekels, shortDate, signedShekels } from '@/lib/format.js';
import { del, patch, post } from './api.js';
import ItemForm, { toForm } from './ItemForm.js';
import Sheet from './Sheet.js';

/**
 * Editing one item, and the payments against it.
 *
 * The payments list is the ledger actual spend is derived from — there is no
 * total stored anywhere, so what is shown here is the sum of exactly these rows.
 * Each one keeps the VAT rate it was charged at, which is why an old payment can
 * show a different split from a new one.
 */
export default function ItemSheet({ item, users, payments, today, vatRateBp, onClose, onChanged }) {
  const [form, setForm] = useState(() => toForm(item));
  const [paid, setPaid] = useState({ gross: '', paidOn: today, note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mine = payments.filter((payment) => payment.itemId === item.id);
  const spent = mine.reduce((total, payment) => total + payment.gross, 0);

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

  const addPayment = () => run(async () => {
    await post('/api/payments', { itemId: item.id, ...paid });
    setPaid({ gross: '', paidOn: today, note: '' });
  });

  return (
    <Sheet title={item.title} onClose={onClose}>
      {error && <p className="notice" style={{ marginBottom: '0.85rem' }}>{error}</p>}

      <ItemForm value={form} users={users} onChange={setForm} />

      <div className="sheet__actions">
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {mine.length === 0 && (
          // Only offered when there is no money against it. With payments the
          // database refuses anyway, and offering an action that cannot work is
          // worse than not offering it.
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
                      {' '}at {(payment.vatRateBp / 100).toFixed(payment.vatRateBp % 100 ? 2 : 0)}%
                    </span>
                  </span>
                  <span className={`ledger__amount ${payment.gross < 0 ? 'ledger__amount--refund' : ''}`}>
                    {shekels(payment.gross, { exact: true })}
                  </span>
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
                </li>
              );
            })}
          </ul>
        )}

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
          Gross, as the invoice says. VAT is worked out at {(vatRateBp / 100).toFixed(0)}% and kept on
          the payment, so changing the rate later will not rewrite this one. A refund is a negative
          amount — “−250”.
        </p>

        <button
          type="button"
          className="btn btn--block"
          onClick={addPayment}
          disabled={busy || !paid.gross}
        >
          Record payment
        </button>
      </section>
    </Sheet>
  );
}
