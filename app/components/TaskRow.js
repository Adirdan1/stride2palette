'use client';

import { buildSubtaskTree, daysUntilDue, directionOf, isOverdue, lockState, subtaskProgress } from '@/lib/core.js';
import { dueLabel, shekels } from '@/lib/format.js';
import Ring from './Ring.js';
import SubtaskTree from './SubtaskTree.js';

/**
 * One line of a board.
 *
 * The spine down the leading edge is the signal, and it is form before colour:
 * solid on track, segmented overdue, dotted waiting, hairline undated, absent
 * when closed. That matters more here than it did, because the accent and the
 * overdue colour are now both red — the shapes are what keep them apart.
 *
 * Description and conclusion are shown inline rather than hidden behind a tap.
 * The point of writing them down is that somebody reads them without meaning to.
 *
 * Two targets, not one. Tapping the row opens its steps in place; the ⋯ opens
 * the sheet, where the fields are. They were the same tap before, which meant
 * the common move — glance at the steps, tick one — cost a modal, a lease
 * claimed on somebody else's behalf, and a way back out. Steps are what you
 * look at; owners, tags and dates are what you occasionally change.
 *
 * This is why the row is a div with two buttons in it rather than one button:
 * a button cannot contain a button, and the ⋯ has to be its own target.
 */
export default function TaskRow({
  item, today, spent, owners, steps, holder, viewerId, expanded, busy, onToggleSteps, onEdit, onTickStep,
}) {
  const overdue = isOverdue(item, today);
  const days = daysUntilDue(item, today);
  const closed = item.status === 'done' || item.status === 'dropped';
  const progress = subtaskProgress(steps);
  const lock = lockState(item, viewerId);
  const dir = directionOf(item.title);

  const modifier = closed
    ? `row--closed${item.status === 'dropped' ? ' row--dropped' : ''}`
    : overdue
      ? 'row--overdue'
      : item.status === 'waiting'
        ? 'row--waiting'
        : days === null
          ? 'row--someday'
          : 'row--now';

  const over = item.planned > 0 && spent > item.planned;

  return (
    <li>
      <div
        className={`row ${modifier} ${lock.locked && !lock.mine ? 'row--held' : ''}`}
        dir={dir}
      >
        <button
          type="button"
          className="row__open"
          aria-expanded={expanded}
          onClick={() => onToggleSteps(item.id)}
        >
          <Ring done={progress.done} total={progress.total} />

          <span className="row__body">
            <span className="row__title" dir={dir}>
              {item.title}
              <span className="caret" aria-hidden="true">
                {expanded ? '▾' : dir === 'rtl' ? '◂' : '▸'}
              </span>
            </span>

            {item.description && <span className="blurb" dir="auto">{item.description}</span>}

            {item.conclusion && (
              <span className="blurb blurb--conclusion">
                <span className="blurb__label">Conclusion</span>
                <span dir="auto">{item.conclusion}</span>
              </span>
            )}

            <span className="row__meta">
              {item.due && (
                <span className={overdue ? 'due--overdue' : days !== null && days <= 3 ? 'due--soon' : ''}>
                  {overdue ? `${dueLabel(item.due, today)} — overdue` : dueLabel(item.due, today)}
                </span>
              )}
              {owners.length > 0 && (
                <>
                  {item.due && <span className="dot" aria-hidden="true">·</span>}
                  <span>{owners.map((user) => user.displayName).join(', ')}</span>
                </>
              )}
              {lock.locked && !lock.mine && holder && (
                <>
                  <span className="dot" aria-hidden="true">·</span>
                  <span className="row__held">{holder.displayName} is editing</span>
                </>
              )}
            </span>
          </span>

          {(spent !== 0 || item.planned !== 0) && (
            <span className="row__money">
              <span className={`row__spent ${over ? 'row__over' : ''}`}>{shekels(spent)}</span>
              {item.planned !== 0 && (
                <>
                  <br />
                  <span className="row__planned">of {shekels(item.planned)}</span>
                </>
              )}
            </span>
          )}
        </button>

        <button
          type="button"
          className="row__more"
          aria-label={`Edit ${item.title}`}
          onClick={() => onEdit(item.id)}
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>

      {expanded && (
        <div className="row__steps" dir={dir}>
          {steps.length === 0 ? (
            <p className="row__nosteps">No steps yet. Open ⋯ to break this down.</p>
          ) : (
            <SubtaskTree
              nodes={buildSubtaskTree(steps, item.id)}
              canEdit={false}
              busy={busy}
              onToggle={onTickStep}
            />
          )}
        </div>
      )}
    </li>
  );
}
