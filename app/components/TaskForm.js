'use client';

import { STATUSES } from '@/lib/core.js';

const STATUS_LABEL = {
  todo: 'To do',
  doing: 'Doing',
  waiting: 'Waiting on them',
  done: 'Done',
  dropped: 'Dropped',
};

/** Shared by adding and editing, so the two can never drift apart. */
export default function TaskForm({ value, users, domains, onChange, disabled = false }) {
  const set = (patch) => onChange({ ...value, ...patch });

  const toggleDomain = (key) => {
    const has = value.domains.includes(key);
    set({ domains: has ? value.domains.filter((d) => d !== key) : [...value.domains, key] });
  };

  return (
    <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <label className="field">
        <span className="field__label">What</span>
        <input
          className="input"
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Alcohol licence application"
        />
      </label>

      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          className="input"
          value={value.description ?? ''}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="What this actually involves, and anything whoever picks it up will need."
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

      <label className="field">
        <span className="field__label">
          Conclusion{value.status === 'done' ? ' — required' : ''}
        </span>
        <textarea
          className="input"
          value={value.conclusion ?? ''}
          onChange={(e) => set({ conclusion: e.target.value })}
          placeholder="What happened in the end. Which supplier, what the inspector said, what it cost."
        />
        <span className="field__hint">
          Has to be filled in before this can be marked done. Three months from now this is the
          only record of how it went.
        </span>
      </label>

      <div className="field">
        <span className="field__label">Areas</span>
        <div className="chipbar">
          {domains.map((domain) => (
            <button
              key={domain.key}
              type="button"
              className="chip"
              aria-pressed={value.domains.includes(domain.key)}
              onClick={() => toggleDomain(domain.key)}
            >
              {domain.label}
            </button>
          ))}
        </div>
        <p className="field__hint">
          Pick as many as apply — the task shows up on every one of those pages.
        </p>
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

      <label className="field">
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
    </fieldset>
  );
}

export function emptyTask() {
  return {
    title: '', status: 'todo', description: '', conclusion: '',
    domains: [], due: '', planned: '', ownerId: '',
  };
}

export function toForm(item) {
  return {
    title: item.title,
    status: item.status,
    description: item.description ?? '',
    conclusion: item.conclusion ?? '',
    domains: item.domains ?? [],
    due: item.due ?? '',
    planned: item.planned ? (item.planned / 100).toFixed(2) : '',
    ownerId: item.ownerId ?? '',
  };
}

export { STATUS_LABEL };
