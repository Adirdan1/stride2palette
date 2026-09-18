'use client';

import { useState } from 'react';
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
 * written with `-inline-start` throughout — grows from the right. With it on the
 * title alone the text was right-aligned inside a left-to-right row, which put
 * four levels of indent on the side the eye never reaches and made them look
 * identical.
 *
 * "Add a step under this" only appears while there is room left. Offering an
 * action that the server will refuse is worse than not offering it, and the
 * limit is real: past five levels the indent runs out of width, and a task that
 * needs a sixth is a project that should have been split.
 */
export default function SubtaskTree({ nodes, depth = 1, readOnly, busy, onToggle, onDelete, onAdd }) {
  const [addingUnder, setAddingUnder] = useState(null);
  const [title, setTitle] = useState('');

  if (nodes.length === 0) return null;

  return (
    <ul className={`steps ${depth > 1 ? 'steps--nested' : ''}`}>
      {nodes.map((node) => (
        <li key={node.id} className="steps__item" dir={directionOf(node.title)}>
          <div className="steps__row">
            <input
              type="checkbox"
              className="steps__box"
              checked={node.done}
              disabled={busy || readOnly}
              aria-label={node.title}
              onChange={(e) => onToggle(node.id, e.target.checked)}
            />
            <span className={`steps__title ${node.done ? 'steps__title--done' : ''}`} dir="auto">
              {node.title}
            </span>

            {!readOnly && (
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
                }}
              >
                Add
              </button>
            </div>
          )}

          {node.children.length > 0 && (
            <SubtaskTree
              nodes={node.children}
              depth={depth + 1}
              readOnly={readOnly}
              busy={busy}
              onToggle={onToggle}
              onDelete={onDelete}
              onAdd={onAdd}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
