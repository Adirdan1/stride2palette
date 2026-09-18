// Not a real test: a way to get the REAL components' markup out, instead of
// hand-writing an imitation of it in a harness and measuring the imitation.
import { describe, it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import TaskRow from '../app/components/TaskRow.js';
import { subtasksOf } from '../lib/core.js';

const OUT = process.env.PROBE_OUT;

const item = {
  id: 'i1',
  title: 'בחירת מכונת קפה והבנת העלויות',
  description: 'לבחור מכונת אספרסו ומטחנה שמתאימות לנפח הצפוי, ולהבין את העלות המלאה.',
  conclusion: null,
  status: 'todo',
  due: null,
  planned: 0,
  owners: ['u1'],
  domains: ['coffee'],
  lockedBy: null,
  lockedAt: null,
};

const titles = [
  'להגדיר נפח כוסות ביום ודרישות',
  'לקבל שלוש הצעות מחיר',
  'להשוות רכישה מול ליסינג',
  'לבדוק חוזה שירות ותחזוקה',
  'החלטה והזמנה',
];

const steps = titles.map((title, i) => ({
  id: `s${i}`, itemId: 'i1', parentId: null, title, done: false, position: i,
}));

describe('markup probe', () => {
  it('writes the real TaskRow markup', () => {
    const html = renderToStaticMarkup(
      <ul className="band__list">
        <TaskRow
          item={item}
          today="2026-09-18"
          spent={0}
          owners={[{ id: 'u1', displayName: 'עידו' }]}
          steps={subtasksOf('i1', steps)}
          holder={null}
          viewerId="u1"
          expanded
          busy={false}
          onToggleSteps={() => {}}
          onEdit={() => {}}
          onTickStep={() => {}}
        />
      </ul>,
    );

    const css = readFileSync('app/globals.css', 'utf8')
      .replace(/@media \(prefers-color-scheme: dark\)/g, '@media all');

    const probe = `<pre id="M" style="font:10px monospace;white-space:pre-wrap"></pre>
<script>(function(){
 var out={}, r=function(o){return {l:Math.round(o.left), r:Math.round(o.right)};};
 var ink=function(el){var g=document.createRange(); g.selectNodeContents(el); return r(g.getBoundingClientRect());};
 var ct=document.querySelector('.row__title');
 var st=document.querySelector('.steps__title');
 var cb=document.querySelector('.steps__check');
 out.cardTitleInk=ink(ct); out.stepTitleInk=ink(st);
 out.stepTitleBox=r(st.getBoundingClientRect());
 out.check=r(cb.getBoundingClientRect());
 out.gapCheckToInk=Math.round(cb.getBoundingClientRect().left - ink(st).r);
 out.deltaInkRight=Math.round(ink(ct).r - ink(st).r);
 var cs=getComputedStyle(st); out.style={dir:cs.direction, ta:cs.textAlign};
 var li=document.querySelector('.steps__item');
 out.liDir=li.getAttribute('dir');
 out.stepsDir=document.querySelector('.row__steps').getAttribute('dir');
 document.getElementById('M').textContent=JSON.stringify(out,null,1);
})();</script>`;

    writeFileSync(OUT, `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style>
<style>body{margin:0;background:var(--paper)} .probe{padding:1rem;width:393px;box-sizing:border-box}</style>
</head><body><div class="probe">${html}</div>${probe}</body></html>`);
  });
});
