/**
 * A task's steps, drawn as a ring around its status chip.
 *
 * The fourth orientation of the spine: a rail down a row, a bar under the hero,
 * a mark for pull-to-refresh, and now a circle.
 *
 * A task with no steps shows an empty track and a dash, not a 0% ring. Those are
 * different states — unmeasured versus not started — and a full circle of
 * nothing reads as failure when it should read as "nobody has broken this down
 * yet".
 */
const SIZE = 44;
const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Ring({ done = 0, total = 0, children }) {
  const fraction = total === 0 ? 0 : done / total;
  const complete = total > 0 && done === total;

  return (
    <span
      className={`ring ${complete ? 'ring--complete' : ''}`}
      role="img"
      aria-label={total === 0 ? 'No steps yet' : `${done} of ${total} steps done`}
    >
      <svg className="ring__svg" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle className="ring__track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
        {total > 0 && (
          <circle
            className="ring__value"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            // Counts down from a full circle, so the arc grows clockwise from
            // twelve o'clock as steps are ticked.
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        )}
      </svg>
      <span className={`ring__count ${total === 0 ? 'ring__count--empty' : ''}`}>
        {children ?? (total === 0 ? '–' : `${done}/${total}`)}
      </span>
    </span>
  );
}
