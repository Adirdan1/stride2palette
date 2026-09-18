'use client';

import { useCallback, useRef, useState } from 'react';
import { MAX_SUBTASK_DEPTH, directionOf, dropTarget, isDescendantOf, moveProblem } from '@/lib/core.js';

/**
 * Steps, and steps within steps, up to five levels.
 *
 * Rendered recursively from the tree core builds, with one nested list per
 * level. The indent is a rule rather than padding alone, so on a phone you can
 * still see which parent a deep step belongs to once the text has wrapped.
 *
 * Direction is set on the item, not just on the title: a Hebrew step needs the
 * box order flipped too, not only the text.
 *
 * A step with children collapses. Its title is the disclosure rather than a
 * separate chevron column, because a column costs width on every row including
 * the ones that have nothing to open, and at five levels deep there is none to
 * spare.
 *
 * Ticking and editing are separate permissions. Inline in the list you can tick
 * a step but not restructure the task; the sheet is where steps are added,
 * removed and rearranged.
 *
 * ---------------------------------------------------------------------------
 * Dragging
 *
 * Drag starts on a handle and nowhere else. That is the whole trick to making
 * this work on a phone: a drag that begins anywhere on the row has to guess,
 * within the first few pixels of movement, whether a finger meant to drag the
 * row or scroll the list — and it guesses wrong often enough to make the list
 * feel broken. A handle has no ambiguity to resolve, so `touch-action: none`
 * can sit on it alone and the rest of the list scrolls normally.
 *
 * One gesture does both jobs the tree needs. Near a row's top or bottom edge
 * the drop goes *between* rows at that row's own level; across its middle the
 * drop goes *inside* it. So reordering and re-parenting are the same drag, and
 * "put this step inside that one" is just aiming at the middle.
 *
 * The drop is validated here before any request goes out, so an illegal move
 * says why instead of failing silently — and validated again on the server
 * against the rows as they actually are, because this client's copy is up to
 * five seconds stale and somebody else may have moved the same steps.
 * ---------------------------------------------------------------------------
 */
export default function SubtaskTree({
  nodes, flat = [], canTick = true, canEdit = true, busy,
  onToggle, onDelete, onAdd, onMove, onRefuse,
}) {
  const [open, setOpen] = useState(() => new Set());
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null);
  const listRef = useRef(null);

  const toggleOpen = useCallback((id) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Read the rectangles, hand them to core, and let it decide what they mean.
  // Everything the dragged step contains is filtered out first: aiming a subtree
  // at its own inside would detach it from the tree entirely.
  const findDrop = useCallback((y, draggedId) => {
    const root = listRef.current;
    if (!root) return null;

    const rows = [];
    for (const el of root.querySelectorAll('[data-step-id]')) {
      const id = el.dataset.stepId;
      if (id === draggedId || isDescendantOf(id, draggedId, flat)) continue;

      const box = el.getBoundingClientRect();
      rows.push({
        id,
        parentId: el.dataset.stepParent || null,
        index: Number(el.dataset.stepIndex),
        top: box.top,
        bottom: box.bottom,
      });
    }

    return dropTarget(rows, y);
  }, [flat]);

  const handlers = canEdit && onMove ? {
    onPointerDown: (e, id) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ id });
      setDrop(null);
    },
    onPointerMove: (e) => {
      if (!drag) return;
      setDrop(findDrop(e.clientY, drag.id));
    },
    onPointerUp: async (e) => {
      const active = drag;
      const target = drop;
      setDrag(null);
      setDrop(null);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!active || !target) return;

      const problem = moveProblem(active.id, target.parentId, flat);
      if (problem) {
        onRefuse?.(problem);
        return;
      }

      await onMove(active.id, target.parentId, target.index);
      // A step dropped inside a closed parent has to become visible, or it
      // looks like the drag threw it away.
      if (target.kind === 'inside' && !open.has(target.parentId)) toggleOpen(target.parentId);
    },
    onPointerCancel: () => {
      setDrag(null);
      setDrop(null);
    },
  } : null;

  if (nodes.length === 0) return null;

  return (
    <div ref={listRef} className={drag ? 'steps__dragging' : ''}>
      <Branch
        nodes={nodes}
        depth={1}
        parentId={null}
        open={open}
        onOpenToggle={toggleOpen}
        canTick={canTick}
        canEdit={canEdit}
        busy={busy}
        drag={drag}
        drop={drop}
        handlers={handlers}
        onToggle={onToggle}
        onDelete={onDelete}
        onAdd={onAdd}
      />
    </div>
  );
}

function Branch({
  nodes, depth, parentId, open, onOpenToggle, canTick, canEdit, busy,
  drag, drop, handlers, onToggle, onDelete, onAdd,
}) {
  const [addingUnder, setAddingUnder] = useState(null);
  const [title, setTitle] = useState('');

  if (nodes.length === 0) return null;

  return (
    <ul className={`steps ${depth > 1 ? 'steps--nested' : ''}`}>
      {nodes.map((node, index) => {
        const dir = directionOf(node.title);
        const hasChildren = node.children.length > 0;
        const shown = open.has(node.id);
        const dragging = drag?.id === node.id;
        const aimed = drop?.overId === node.id ? drop.kind : null;

        return (
          <li
            key={node.id}
            className={`steps__item ${dragging ? 'steps__item--lifted' : ''}`}
            dir={dir}
          >
            <div
              className={`steps__row ${aimed ? `steps__row--${aimed}` : ''}`}
              data-step-id={node.id}
              data-step-parent={parentId ?? ''}
              data-step-index={index}
            >
              {handlers && (
                <button
                  type="button"
                  className="steps__grip"
                  aria-label={`Move ${node.title}`}
                  disabled={busy}
                  onPointerDown={(e) => handlers.onPointerDown(e, node.id)}
                  onPointerMove={handlers.onPointerMove}
                  onPointerUp={handlers.onPointerUp}
                  onPointerCancel={handlers.onPointerCancel}
                >
                  <span aria-hidden="true">⠿</span>
                </button>
              )}

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
                parentId={node.id}
                open={open}
                onOpenToggle={onOpenToggle}
                canTick={canTick}
                canEdit={canEdit}
                busy={busy}
                drag={drag}
                drop={drop}
                handlers={handlers}
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
