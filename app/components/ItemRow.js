'use client';

import { daysUntilDue, isOverdue } from '@/lib/core.js';
import { dueLabel, shekels } from '@/lib/format.js';

/**
 * One line of the board.
 *
 * The spine down the left is the signal, and it is form before colour: solid on
 * track, segmented overdue, dotted waiting, hairline undated, absent when
 * closed. See the rows section of globals.css — and check any new state in
 * greyscale before shipping it.
 */
export default function ItemRow({ item, today, spent, owner, onOpen }) {
  const overdue = isOverdue(item, today);
  const days = daysUntilDue(item, today);
  const closed = item.status === 'done' || item.status === 'dropped';

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
      <button type="button" className={`row ${modifier}`} onClick={() => onOpen(item.id)}>
        <span className="row__body">
          <span className="row__title">{item.title}</span>
          <span className="row__meta">
            <span className="tag">{item.category}</span>
            {item.due && (
              <>
                <span className="dot" aria-hidden="true">·</span>
                <span className={overdue ? 'due--overdue' : days !== null && days <= 3 ? 'due--soon' : ''}>
                  {overdue ? `${dueLabel(item.due, today)} — overdue` : dueLabel(item.due, today)}
                </span>
              </>
            )}
            {owner && (
              <>
                <span className="dot" aria-hidden="true">·</span>
                <span>{owner.displayName}</span>
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
    </li>
  );
}
