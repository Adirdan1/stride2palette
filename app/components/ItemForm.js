'use client';

import { useState } from 'react';
import { CATEGORIES, STATUSES } from '@/lib/core.js';

const STATUS_LABEL = {
  todo: 'To do',
  doing: 'Doing',
  waiting: 'Waiting on them',
  done: 'Done',
  dropped: 'Dropped',
};

/** Shared by adding and editing, so the two can never drift apart. */
export default function ItemForm({ value, users, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <>
      <label className="field">
        <span className="field__label">What</span>
        <input
          className="input"
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Alcohol licence application"
          autoFocus
        />
      </label>

      <div className="field">
        <span className="field__label">Where it stands</span>
        <div className="chipbar">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="chip"
              aria-pressed={value.status === status}
              onClick={() => set({ status })}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        {value.status === 'waiting' && (
          <p className="field__hint">
            Waiting keeps it off the actionable list — it is somebody else’s move now.
          </p>
        )}
      </div>

      <div className="field">
        <span className="field__label">Kind</span>
        <div className="chipbar">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className="chip"
              aria-pressed={value.category === category}
              onClick={() => set({ category })}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="row-2">
        <label className="field">
          <span className="field__label">Due</span>
          <input
            className="input"
            type="date"
            value={value.due ?? ''}
            onChange={(e) => set({ due: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">Planned cost</span>
          <input
            className="input"
            inputMode="decimal"
            value={value.planned}
            onChange={(e) => set({ planned: e.target.value })}
            placeholder="₪0"
          />
        </label>
      </div>
      <p className="field__hint" style={{ marginTop: '-0.5rem' }}>
        Amounts are what the invoice says, VAT included. Leave the date empty if there isn’t one —
        undated is a real answer here, not a gap.
      </p>

      {users.length > 0 && (
        <label className="field" style={{ marginTop: '0.85rem' }}>
          <span className="field__label">Whose job</span>
          <select
            className="input"
            value={value.ownerId ?? ''}
            onChange={(e) => set({ ownerId: e.target.value })}
          >
            <option value="">Nobody yet</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName}</option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span className="field__label">Notes</span>
        <textarea
          className="input"
          value={value.note ?? ''}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Reference numbers, who you spoke to, what they said"
        />
      </label>
    </>
  );
}

export function emptyItem() {
  return { title: '', status: 'todo', category: 'other', due: '', planned: '', ownerId: '', note: '' };
}

export function toForm(item) {
  return {
    title: item.title,
    status: item.status,
    category: item.category,
    due: item.due ?? '',
    planned: item.planned ? (item.planned / 100).toFixed(2) : '',
    ownerId: item.ownerId ?? '',
    note: item.note ?? '',
  };
}

export { STATUS_LABEL };
