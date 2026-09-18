'use client';

import { useState } from 'react';
import { shekels, shortDate } from '@/lib/format.js';

/**
 * The pot over time: one cumulative line, with the area beneath it filled.
 *
 * One series, so there is no legend and no categorical palette to validate —
 * the title names what it is and the accent carries it. A target, when one is
 * set, is a dashed rule rather than a second series: it is a reference line,
 * not a thing being compared.
 *
 * The last point is labelled directly and nothing else is, which is the rule
 * for a running total — the number that matters is where it stands now.
 *
 * Touch and hover both move a crosshair, because on a phone there is no hover
 * and a chart you cannot interrogate is a picture.
 */
const W = 320;
const H = 132;
const PAD = { top: 12, right: 10, bottom: 20, left: 10 };

export default function FundChart({ series, target = 0, today }) {
  const [active, setActive] = useState(null);

  if (series.length === 0) {
    return (
      <p className="band__empty">Nothing in the pot yet. Record the first deposit below.</p>
    );
  }

  // A single deposit has no line to draw, so it is given a flat run from its own
  // day — otherwise the chart is one dot floating in an empty box.
  const points = series.length === 1
    ? [{ ...series[0], balance: 0 }, series[0]]
    : series;

  const top = Math.max(target, ...points.map((p) => p.balance), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i) => PAD.left + (points.length === 1 ? innerW : (i / (points.length - 1)) * innerW);
  const y = (v) => PAD.top + innerH - (v / top) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  const last = points[points.length - 1];
  const shown = active ?? { index: points.length - 1, point: last };

  const pick = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const ratio = (clientX - box.left) / box.width;
    const index = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    setActive({ index, point: points[index] });
  };

  return (
    <figure className="chart">
      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`The shared fund over time, currently ${shekels(last.balance)}`}
        onMouseMove={pick}
        onMouseLeave={() => setActive(null)}
        onTouchStart={pick}
        onTouchMove={pick}
        onTouchEnd={() => setActive(null)}
      >
        {target > 0 && (
          <>
            <line
              className="chart__target"
              x1={PAD.left} x2={W - PAD.right}
              y1={y(target)} y2={y(target)}
            />
            <text className="chart__targetLabel" x={W - PAD.right} y={y(target) - 4} textAnchor="end">
              target {shekels(target)}
            </text>
          </>
        )}

        <path className="chart__area" d={area} />
        <path className="chart__line" d={line} />

        <line
          className="chart__crosshair"
          x1={x(shown.index)} x2={x(shown.index)}
          y1={PAD.top} y2={PAD.top + innerH}
        />
        <circle className="chart__dot" cx={x(shown.index)} cy={y(shown.point.balance)} r="4.5" />
      </svg>

      <figcaption className="chart__caption">
        <span className="chart__value">{shekels(shown.point.balance)}</span>
        <span className="chart__when">{shortDate(shown.point.date, today)}</span>
      </figcaption>
    </figure>
  );
}
