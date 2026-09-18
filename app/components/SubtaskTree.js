'use client';

import { useCallback, useState } from 'react';
import { MAX_SUBTASK_DEPTH, directionOf } from '@/lib/core.js';

/**
 * Steps, and steps within steps, up to five levels.
 *
 * Rendered recursively from the tree core builds, with one nested list per
 * level. The indent is a rule rather than padding alone, so on a phone you can
 * still see which parent a deep step belongs to once the text has wrapped.
 *
 * Direction is set on the item, not just on the title: a Hebrew step needs the
 * box order flipped too, not only the text. With it on the item the checkbox
 * lands where the reader starts, the actions at the far end, and the indent —
 * written with `-inline-start` throughout — grows from the right.
 *
 * A step with children collapses. Its title is the disclosure rather than a
 * separate chevron column, because a column costs width on every row including
 * the ones that have nothing to open, and at five levels deep there is none to
 * spare. Everything starts closed: the point of opening a task is to see its
 * steps, not to be handed the whole tree at once.
 *
 * Ticking and editing are separate permissions. Inline in the list you can tick
 * a step but not restructure the task; the sheet is where steps are added and
 * removed. A tick is a single atomic boolean, so it needs no edit lease — last
 * write wins and the poll reconciles it. A draft of several fields is a
 * different thing, and that is what the lease protects.
 */
export default function SubtaskTree({
  nodes, canTick = true, canEdit = true, busy, onToggle, onDelete, onAdd,
}) {
  const [open, setOpen] = useState(() => new Set());

  const toggleOpen = useCallback((id) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (nodes.length === 0) return null;

  return (
    <Branch
      nodes={nodes}
      depth={1}
      open={open}
      onOpenToggle={toggleOpen}
      canTick={canTick}
      canEdit={canEdit}
      busy={busy}
      onToggle={onToggle}
      onDelete={onDelete}
      onAdd={onAdd}
    />
  );
}

function Branch({
  nodes, depth, open, onOpenToggle, canTick, canEdit, busy, onToggle, onDelete, onAdd,
}) {
  const [addingUnder, setAddingUnder] = useState(null);
  const [title, setTitle] = useState('');

  if (nodes.length === 0) return null;

  return (
    <ul className={`steps ${depth > 1 ? 'steps--nested' : ''}`}>
      {nodes.map((node) => {
        const dir = directionOf(node.title);
        const hasChildren = node.children.length > 0;
        const shown = open.has(node.id);

        return (
          <li key={node.id} className="steps__item" dir={dir}>
            <div className="steps__row">
              {/* The hit area is the label, not the box. A bare 18px checkbox is
                  not tappable on a phone, and inflating the whole row to reach
                  44px buys 25px of air per step and still leaves the box at
                  18px. The label carries the target; the row stays tight. */}
              <label className="steps__check">
                <input
                  type="checkbox"
                  className="steps__box"
                  checked={node.done}
                  disabled={busy || !canTick}
                  aria-label={node.title}
                  onChange={(e) => onToggle(node.id, e.target.checked)}
                />
              </label>

              {hasChildren ? (
                <button
                  type="button"
                  className={`steps__title steps__open ${node.done ? 'steps__title--done' : ''}`}
                  aria-expanded={shown}
                  onClick={() => onOpenToggle(node.id)}
                >
                  {node.title}
                  <span className="caret" aria-hidden="true">
                    {shown ? '▾' : dir === 'rtl' ? '◂' : '▸'}
                  </span>
                  <span className="steps__tally">{node.children.length}</span>
                </button>
              ) : (
                <span className={`steps__title ${node.done ? 'steps__title--done' : ''}`}>
                  {node.title}
                </span>
              )}

              {canEdit && (
                <span className="steps__actions">
                  {depth < MAX_SUBTASK_DEPTH && (
                    <button
                      type="button"
                      className="steps__action"
                      aria-label={`Add a step under ${node.title}`}
                      disabled={busy}
                      onClick={() => {
                        setAddingUnder(addingUnder === node.id ? null : node.id);
                        setTitle('');
                      }}
                    >
                      +
                    </button>
                  )}
                  <button
                    type="button"
                    className="steps__action"
                    aria-label={`Remove ${node.title}`}
                    disabled={busy}
                    onClick={() => onDelete(node.id)}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            {addingUnder === node.id && (
              <div className="steps__add">
                <input
                  dir="auto"
                  className="input"
                  value={title}
                  autoFocus
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Step under this one"
                />
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !title.trim()}
                  onClick={async () => {
                    await onAdd(title, node.id);
                    setTitle('');
                    setAddingUnder(null);
                    // A step you just created should be visible, not filed away
                    // behind a chevron you did not know had appeared.
                    if (!open.has(node.id)) onOpenToggle(node.id);
                  }}
                >
                  Add
                </button>
              </div>
            )}

            {hasChildren && shown && (
              <Branch
                nodes={node.children}
                depth={depth + 1}
                open={open}
                onOpenToggle={onOpenToggle}
                canTick={canTick}
                canEdit={canEdit}
                busy={busy}
                onToggle={onToggle}
                onDelete={onDelete}
                onAdd={onAdd}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
