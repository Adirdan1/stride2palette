// Renders the real PeopleScreen with one person expanded, so the nested list
// is measured as the app actually builds it rather than as a harness imagines.
import { describe, it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import PeopleScreen from '../app/components/PeopleScreen.js';
import TaskList from '../app/components/TaskList.js';
import { summarisePeople } from '../lib/core.js';

const OUT = process.env.PROBE_OUT;

const users = [
  { id: 'u1', username: 'adidaniel', displayName: 'עדי' },
  { id: 'u2', username: 'idonaor', displayName: 'עידו' },
  { id: 'u3', username: 'adirdanan', displayName: 'אדיר' },
];

const mk = (id, title, owners, due = null) => ({
  id, title, description: '', conclusion: null, status: 'todo',
  due, planned: 0, owners, domains: ['kitchen'], lockedBy: null, lockedAt: null,
});

const items = [
  mk('i1', 'הקמת הקופה המשותפת וניהולה', ['u3']),
  mk('i2', 'רישוי עסק בעיריית מודיעין', ['u3'], '2026-09-30'),
  mk('i3', 'הסכם שותפים כתוב', ['u1', 'u2', 'u3']),
  mk('i4', 'בניית התפריט ועיצובו', ['u1']),
];

const subtasks = [
  { id: 's1', itemId: 'i1', parentId: null, title: 'לקבוע סכום הפקדה ראשוני', done: true, position: 0, conclusion: '2,000 ש״ח כל אחד להתחלה.' },
  { id: 's2', itemId: 'i1', parentId: null, title: 'לפתוח חשבון משותף', done: false, position: 1, conclusion: null },
];

describe('people probe', () => {
  it('writes the real PeopleScreen markup with one person open', () => {
    // Two renders, both of real components. PeopleScreen opens a person on
    // click and a static render cannot click, so the open state is reproduced
    // by mounting the same TaskList in the same wrapper PeopleScreen uses —
    // the only hand-written part is that one div, copied from it verbatim.
    const html = renderToStaticMarkup(
      <PeopleScreen
        people={summarisePeople(items, users, '2026-09-19')}
        items={items}
        subtasks={subtasks}
        payments={[]}
        spend={{}}
        today="2026-09-19"
        me={users[2]}
        domains={[{ key: 'kitchen', label: 'Kitchen', position: 1 }]}
        openByDomain={{ kitchen: 4 }}
        settings={{ vatRateBp: 1800, targetOpenDate: null, fundTarget: 0 }}
        users={users}
      />,
    );

    const opened = renderToStaticMarkup(
      <div className="person__work">
        <TaskList
          items={items.filter((i) => i.owners.includes('u3'))}
          allItems={items}
          subtasks={subtasks}
          payments={[]}
          users={users}
          domains={[{ key: 'kitchen', label: 'Kitchen', position: 1 }]}
          settings={{ vatRateBp: 1800, targetOpenDate: null, fundTarget: 0 }}
          today="2026-09-19"
          spend={{}}
          me={users[2]}
          canAdd={false}
          compact
        />
      </div>,
    );

    const css = readFileSync('app/globals.css', 'utf8')
      .replace(/@media \(prefers-color-scheme: dark\)/g, '@media all');

    const probe = `<pre id="M" style="font:10px monospace;white-space:pre-wrap"></pre>
<script>(function(){
 var out={}, r=function(o){return {l:Math.round(o.left), r:Math.round(o.right)};};
 var P=document.querySelector('.probe'), pb=P.getBoundingClientRect();
 var rows=document.querySelectorAll('.person');
 out.people=rows.length;
 out.tags=[].map.call(rows,function(n){return n.tagName;});
 out.expanded=[].map.call(rows,function(n){return n.getAttribute('aria-expanded');});
 out.overflow=P.scrollWidth-Math.round(pb.width);
 out.bad=[];
 rows.forEach(function(n){var b=n.getBoundingClientRect();
   if(b.left<pb.left-0.5||b.right>pb.right+0.5) out.bad.push('overflow');
   if(b.height<44) out.bad.push('target '+Math.round(b.height));});
 var work=document.querySelector('.person__work');
 if(work){ var wb=work.getBoundingClientRect();
   out.work=r(wb);
   if(wb.left<pb.left-0.5||wb.right>pb.right+0.5) out.bad.push('work overflows');
   out.nestedBands=work.querySelectorAll('.band--nested').length;
   out.nestedRows=work.querySelectorAll('.row').length;
   var rowEl=work.querySelector('.row');
   if(rowEl){var rb=rowEl.getBoundingClientRect();
     out.nestedRow=r(rb);
     if(rb.left<pb.left-0.5||rb.right>pb.right+0.5) out.bad.push('nested row overflows');}
 }
 var name=document.querySelector('.person__name');
 out.nameDir=getComputedStyle(name).direction;
 out.nameInk=(function(){var g=document.createRange();g.selectNodeContents(name);return r(g.getBoundingClientRect());})();
 document.getElementById('M').textContent=JSON.stringify(out,null,1);
})();</script>`;

    writeFileSync(OUT, `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style>
<style>body{margin:0;background:var(--paper)} .probe{padding:1rem;width:393px;box-sizing:border-box}</style>
</head><body><div class="probe">${html}<hr style="margin:1.5rem 0;border:0;border-top:1px dashed var(--line-strong)">${opened}</div>${probe}</body></html>`);
  });
});
