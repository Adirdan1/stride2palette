'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { groupItems, subtasksOf } from '@/lib/core.js';
import { patch, post } from './api.js';
import { useScreenAction } from './Screen.js';
import Sheet from './Sheet.js';
import TaskForm, { emptyTask } from './TaskForm.js';
import TaskRow from './TaskRow.js';
import TaskSheet from './TaskSheet.js';

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

/**
 * A list of tasks in bands, with the sheets that go with it.
 *
 * Deliberately not a page. A domain page is one of these inside the shell; the
 * people page is several of them, one under each person, opened in place. That
 * is the whole reason it was pulled out of the screen it used to live in —
 * tapping a person to be taken somewhere else is a page transition charged for
 * a list you could have been shown where you were standing.
 *
 * Everything that makes a list work travels with it: which tasks have their
 * steps open, the edit sheet, ticking, and writing up a step. Several of these
 * on one page therefore do not interfere — each keeps its own.
 */
export default function TaskList({
  items, allItems, subtasks, payments, users, domains, settings,
  today, spend, me, presetDomain, canAdd = true, compact = false,
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState(null);
  const [draft, setDraft] = useState(() => ({
    ...emptyTask(),
    domains: presetDomain ? [presetDomain] : [],
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Which tasks are showing their steps. Kept here rather than in the row so it
  // survives the five-second poll: the list re-renders constantly, and a tree
  // that closed itself under your thumb every few seconds would be unusable.
  const [expanded, setExpanded] = useState(() => new Set());

  // Claim the top bar's action, and give it back on the way out. A people page
  // showing three of these has none of them claim it, so the bar stays honest
  // about what "add" would even mean there.
  const slot = useScreenAction();
  useEffect(() => {
    if (!canAdd || !slot) return undefined;
    slot.set({ label: 'Add a task', onClick: () => setSheet({ kind: 'add' }) });
    return () => slot.set(null);
  }, [canAdd, slot]);

  const toggleSteps = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const byId = new Map(users.map((user) => [user.id, user]));
  // The sheet is looked up across every task, not just the visible ones, so a
  // task that leaves this list mid-edit does not vanish from under the form.
  const open = sheet?.kind === 'task' ? allItems.find((item) => item.id === sheet.id) : null;
  const bands = groupItems(items, today);

  const refresh = async () => router.refresh();

  // Ticking a step from the list claims no lease. A step's done flag is one
  // atomic boolean, so the worst a race can do is agree — unlike a draft of
  // several fields, which is what the lease actually protects.
  const tickStep = async (id, done) => {
    setBusy(true);
    setError('');
    try {
      await patch(`/api/subtasks/${id}`, { done });
      await refresh();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const concludeStep = async (id, conclusion) => {
    setError('');
    try {
      await patch(`/api/subtasks/${id}`, { conclusion });
      await refresh();
    } catch (problem) {
      setError(problem.message);
    }
  };

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await post('/api/items', { ...draft, planned: draft.planned === '' ? 0 : draft.planned });
      setDraft({ ...emptyTask(), domains: presetDomain ? [presetDomain] : [] });
      setSheet(null);
      await refresh();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && !sheet && (
        <p className="notice" style={{ marginTop: '0.6rem' }}>{error}</p>
      )}

      {Object.keys(BAND_TITLES).map((band) => {
        const rows = bands[band] ?? [];
        // Nested under a person, a band with nothing in it is noise: you came
        // to see what they are carrying, not five headings saying "none".
        if (rows.length === 0 && (compact || band === 'closed')) return null;

        return (
          <section className={`band ${compact ? 'band--nested' : ''}`} key={band}>
            <div className="band__head">
              <h2 className="band__title">{BAND_TITLES[band]}</h2>
              <span className="band__count">{rows.length}</span>
            </div>
            {rows.length === 0 ? (
              <p className="band__empty">{BAND_EMPTY[band]}</p>
            ) : (
              <ul className="band__list">
                {rows.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    today={today}
                    spent={spend[item.id] ?? 0}
                    owners={(item.owners ?? []).map((id) => byId.get(id)).filter(Boolean)}
                    steps={subtasksOf(item.id, subtasks)}
                    holder={byId.get(item.lockedBy)}
                    viewerId={me?.id}
                    expanded={expanded.has(item.id)}
                    busy={busy}
                    onToggleSteps={toggleSteps}
                    onEdit={(id) => setSheet({ kind: 'task', id })}
                    onTickStep={tickStep}
                    onConcludeStep={concludeStep}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {sheet?.kind === 'add' && (
        <Sheet title="Add a task" onClose={() => setSheet(null)}>
          {error && <p className="notice" style={{ marginBottom: '0.85rem' }}>{error}</p>}
          <TaskForm value={draft} users={users} domains={domains} onChange={setDraft} />
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
        <TaskSheet
          item={open}
          users={users}
          domains={domains}
          payments={payments}
          steps={subtasksOf(open.id, subtasks)}
          today={today}
          vatRateBp={settings.vatRateBp}
          viewerId={me?.id}
          onClose={() => setSheet(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}
