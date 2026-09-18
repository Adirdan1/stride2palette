import { describe, expect, it } from 'vitest';
import {
  directionOf,
  dropTarget,
  isDescendantOf,
  moveProblem,
  placeSubtask,
  subtreeHeight,
  BANDS,
  CONCLUSION_REQUIRED,
  LOCK_LEASE_MS,
  canComplete,
  canEdit,
  completionProblem,
  DEFAULT_VAT_RATE_BP,
  LOCKOUT_MAX_MINUTES,
  NOW_HORIZON_DAYS,
  STATUSES,
  addDays,
  bandOf,
  clearFailures,
  compareItems,
  daysBetween,
  daysUntilDue,
  fromDayNumber,
  groupItems,
  heroState,
  isAgorot,
  hasDomain,
  inDomain,
  lockState,
  isDate,
  isLockedOut,
  isOpen,
  isOverdue,
  isStatus,
  overviewStats,
  MAX_SUBTASK_DEPTH,
  buildSubtaskTree,
  canNestUnder,
  depthOf,
  ownedBy,
  subtaskProgress,
  unowned,
  subtasksOf,
  summariseFund,
  summarisePeople,
  isValidPin,
  isValidUsername,
  normaliseSettings,
  parseAgorot,
  registerFailure,
  spentOn,
  summariseBudget,
  toDayNumber,
  todayIn,
  vatSplit,
} from '../lib/core.js';

const item = (over = {}) => ({
  id: over.id ?? 'i1',
  title: over.title ?? 'Thing',
  domains: over.domains ?? [],
  owners: over.owners ?? [],
  status: over.status ?? 'todo',
  due: over.due ?? null,
  planned: over.planned ?? 0,
  position: over.position ?? 0,
  ...over,
});

const payment = (over = {}) => ({
  id: over.id ?? 'p1',
  itemId: over.itemId ?? 'i1',
  paidOn: over.paidOn ?? '2026-09-17',
  gross: over.gross ?? 0,
  vatRateBp: over.vatRateBp ?? DEFAULT_VAT_RATE_BP,
  ...over,
});

// ---------------------------------------------------------------------------
describe('dates', () => {
  it('recognises only YYYY-MM-DD', () => {
    expect(isDate('2026-09-17')).toBe(true);
    expect(isDate('2026-9-17')).toBe(false);
    expect(isDate('17/09/2026')).toBe(false);
    expect(isDate('2026-09-17T00:00:00Z')).toBe(false);
    expect(isDate(20260917)).toBe(false);
    expect(isDate(null)).toBe(false);
    expect(isDate(undefined)).toBe(false);
  });

  it('rejects non-dates loudly rather than coercing', () => {
    expect(() => toDayNumber('nope')).toThrow(TypeError);
    expect(() => toDayNumber(null)).toThrow(TypeError);
  });

  it('round-trips day numbers across 40,000 days', () => {
    const start = toDayNumber('1970-01-01');
    for (let n = start; n < start + 40000; n += 1) {
      expect(toDayNumber(fromDayNumber(n))).toBe(n);
    }
  });

  it('agrees with Date.UTC as an independent oracle', () => {
    // Date.UTC maps years 0-99 onto 1900-1999, so it is only a valid oracle at
    // or above year 100. Start well clear of that.
    for (let n = toDayNumber('1000-01-01'); n < toDayNumber('1000-01-01') + 20000; n += 97) {
      const date = fromDayNumber(n);
      const [y, m, d] = date.split('-').map(Number);
      expect(Date.UTC(y, m - 1, d) / 86400000).toBe(n);
    }
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-09-17', 1)).toBe('2026-09-18');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is a leap year
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // 2026 is not
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01'); // century, not a leap year
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29'); // divisible by 400, is one
  });

  it('counts signed days between dates', () => {
    expect(daysBetween('2026-09-17', '2026-09-18')).toBe(1);
    expect(daysBetween('2026-09-18', '2026-09-17')).toBe(-1);
    expect(daysBetween('2026-09-17', '2026-09-17')).toBe(0);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('resolves the local calendar date, not the UTC one', () => {
    // 21:30 UTC is already the next day in Jerusalem, and still the same day in
    // New York. This is the one function where that distinction exists.
    const instant = new Date('2026-09-17T21:30:00Z');
    expect(todayIn('Asia/Jerusalem', instant)).toBe('2026-09-18');
    expect(todayIn('UTC', instant)).toBe('2026-09-17');
    expect(todayIn('America/New_York', instant)).toBe('2026-09-17');
  });

  it('survives the DST changeover', () => {
    // Israel leaves DST in late October. A date must not slip either side of it.
    const before = new Date('2026-10-24T22:30:00Z');
    const after = new Date('2026-10-26T22:30:00Z');
    expect(todayIn('Asia/Jerusalem', before)).toBe('2026-10-25');
    expect(todayIn('Asia/Jerusalem', after)).toBe('2026-10-27');
  });
});

// ---------------------------------------------------------------------------
describe('vatSplit', () => {
  it('extracts VAT from a gross amount', () => {
    // 1180.00 gross at 18% is 1000.00 net plus 180.00 VAT.
    expect(vatSplit(118000, 1800)).toEqual({ gross: 118000, vat: 18000, net: 100000 });
  });

  it('always sums back to the gross, at every amount and rate', () => {
    for (const rate of [0, 1700, 1800, 2000, 2500]) {
      for (let gross = 0; gross < 5000; gross += 7) {
        const { net, vat } = vatSplit(gross, rate);
        expect(net + vat).toBe(gross);
      }
    }
  });

  it('handles a zero rate as no VAT at all', () => {
    expect(vatSplit(118000, 0)).toEqual({ gross: 118000, vat: 0, net: 118000 });
  });

  it('handles a refund as a negative split', () => {
    const { gross, net, vat } = vatSplit(-118000, 1800);
    expect(gross).toBe(-118000);
    expect(vat).toBe(-18000);
    expect(net + vat).toBe(gross);
  });

  it('defaults to the current Israeli rate', () => {
    expect(DEFAULT_VAT_RATE_BP).toBe(1800);
    expect(vatSplit(118000)).toEqual(vatSplit(118000, 1800));
  });

  it('refuses floats and nonsense rather than rounding silently', () => {
    expect(() => vatSplit(1180.5)).toThrow(TypeError);
    expect(() => vatSplit('118000')).toThrow(TypeError);
    expect(() => vatSplit(118000, -1)).toThrow(RangeError);
  });

  it('recognises agorot', () => {
    expect(isAgorot(0)).toBe(true);
    expect(isAgorot(-5)).toBe(true);
    expect(isAgorot(1.5)).toBe(false);
    expect(isAgorot(NaN)).toBe(false);
    expect(isAgorot('5')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('parseAgorot', () => {
  it('reads the shapes a person actually types', () => {
    expect(parseAgorot('1180')).toBe(118000);
    expect(parseAgorot('1180.5')).toBe(118050);
    expect(parseAgorot('1180.50')).toBe(118050);
    expect(parseAgorot('1,180.50')).toBe(118050);
    expect(parseAgorot('₪1,180.50')).toBe(118050);
    expect(parseAgorot(' 1 180.50 ')).toBe(118050);
    expect(parseAgorot('0')).toBe(0);
    expect(parseAgorot('0.07')).toBe(7);
  });

  it('reads a refund as negative', () => {
    expect(parseAgorot('-250')).toBe(-25000);
    expect(parseAgorot('-1,180.50')).toBe(-118050);
  });

  it('returns null rather than zero for anything it cannot read', () => {
    // The distinction matters: treating an unreadable amount as zero is how a
    // budget quietly stops matching reality.
    expect(parseAgorot('')).toBe(null);
    expect(parseAgorot('abc')).toBe(null);
    expect(parseAgorot('1180.555')).toBe(null);
    expect(parseAgorot('1.2.3')).toBe(null);
    expect(parseAgorot('--5')).toBe(null);
    expect(parseAgorot(null)).toBe(null);
    expect(parseAgorot(undefined)).toBe(null);
    expect(parseAgorot({})).toBe(null);
  });

  it('accepts a number as shekels', () => {
    expect(parseAgorot(1180)).toBe(118000);
    expect(parseAgorot(1180.5)).toBe(118050);
  });
});

// ---------------------------------------------------------------------------
describe('moving steps', () => {
  // a > b > c > d, plus a sibling e under the same item.
  const chain = [
    { id: 'a', itemId: 'i1', parentId: null, position: 0, title: 'a' },
    { id: 'b', itemId: 'i1', parentId: 'a', position: 0, title: 'b' },
    { id: 'c', itemId: 'i1', parentId: 'b', position: 0, title: 'c' },
    { id: 'd', itemId: 'i1', parentId: 'c', position: 0, title: 'd' },
    { id: 'e', itemId: 'i1', parentId: null, position: 1, title: 'e' },
    { id: 'z', itemId: 'i2', parentId: null, position: 0, title: 'z' },
  ];

  it('measures how tall a subtree is', () => {
    expect(subtreeHeight('a', chain)).toBe(4);
    expect(subtreeHeight('c', chain)).toBe(2);
    expect(subtreeHeight('d', chain)).toBe(1);
    expect(subtreeHeight('e', chain)).toBe(1);
  });

  it('knows what sits beneath what', () => {
    expect(isDescendantOf('d', 'a', chain)).toBe(true);
    expect(isDescendantOf('d', 'c', chain)).toBe(true);
    expect(isDescendantOf('a', 'd', chain)).toBe(false);
    expect(isDescendantOf('e', 'a', chain)).toBe(false);
  });

  it('allows a move that fits', () => {
    expect(moveProblem('e', 'c', chain)).toBeNull();
    expect(moveProblem('e', null, chain)).toBeNull();
  });

  it('refuses to put a step inside itself', () => {
    expect(moveProblem('a', 'a', chain)).toMatch(/inside itself/);
  });

  it('refuses to put a step inside its own subtree', () => {
    // This is the one that loses data rather than merely looking wrong: the
    // whole subtree would detach from the tree and never render again.
    expect(moveProblem('a', 'd', chain)).toMatch(/one of its own steps/);
    expect(moveProblem('b', 'c', chain)).toMatch(/one of its own steps/);
  });

  it('refuses to cross to another task', () => {
    expect(moveProblem('e', 'z', chain)).toMatch(/another task/);
  });

  it('counts the whole subtree against the depth limit, not just the target', () => {
    // A three-level subtree, and a three-level chain to drop it onto.
    const tall = [
      { id: 'T1', itemId: 'i1', parentId: null, position: 0, title: 'T1' },
      { id: 'T2', itemId: 'i1', parentId: 'T1', position: 0, title: 'T2' },
      { id: 'T3', itemId: 'i1', parentId: 'T2', position: 0, title: 'T3' },
      { id: 'H1', itemId: 'i1', parentId: null, position: 1, title: 'H1' },
      { id: 'H2', itemId: 'i1', parentId: 'H1', position: 0, title: 'H2' },
      { id: 'H3', itemId: 'i1', parentId: 'H2', position: 0, title: 'H3' },
    ];

    expect(subtreeHeight('T1', tall)).toBe(3);

    // Onto level two: 2 + 3 = 5, exactly the limit, so it fits.
    expect(moveProblem('T1', 'H2', tall)).toBeNull();

    // Onto level three: 2 + 3 = 6. Checking only the target's depth would let
    // this through and then silently render a sixth level.
    expect(moveProblem('T1', 'H3', tall)).toMatch(/deeper than 5/);

    // A leaf onto the deepest level still fits, which is the case that makes
    // the distinction worth drawing at all.
    expect(moveProblem('e', 'd', chain)).toBeNull();
  });

  it('renumbers siblings from zero and reports only what changed', () => {
    const rows = [
      { id: 'p', itemId: 'i1', parentId: null, position: 0, title: 'p' },
      { id: 'q', itemId: 'i1', parentId: null, position: 1, title: 'q' },
      { id: 'r', itemId: 'i1', parentId: null, position: 2, title: 'r' },
    ];

    const writes = placeSubtask(rows, 'r', null, 0);
    expect(writes).toContainEqual({ id: 'r', parentId: null, position: 0 });
    expect(writes).toContainEqual({ id: 'p', position: 1 });
    expect(writes).toContainEqual({ id: 'q', position: 2 });
  });

  it('leaves untouched siblings out of the writes', () => {
    const rows = [
      { id: 'p', itemId: 'i1', parentId: null, position: 0, title: 'p' },
      { id: 'q', itemId: 'i1', parentId: null, position: 1, title: 'q' },
      { id: 'r', itemId: 'i1', parentId: null, position: 2, title: 'r' },
    ];

    // Moving the last item to the end changes nothing but its own row.
    const writes = placeSubtask(rows, 'r', null, 2);
    expect(writes).toEqual([{ id: 'r', parentId: null, position: 2 }]);
  });

  it('clamps an index past either end', () => {
    const rows = [
      { id: 'p', itemId: 'i1', parentId: null, position: 0, title: 'p' },
      { id: 'q', itemId: 'i1', parentId: null, position: 1, title: 'q' },
    ];

    expect(placeSubtask(rows, 'q', null, 99)).toContainEqual({ id: 'q', parentId: null, position: 1 });
    expect(placeSubtask(rows, 'q', null, -5)).toContainEqual({ id: 'q', parentId: null, position: 0 });
  });

  it('records the new parent when a step changes level', () => {
    const writes = placeSubtask(chain, 'e', 'a', 0);
    expect(writes).toContainEqual({ id: 'e', parentId: 'a', position: 0 });
    // 'b' was the only child, so it moves down one.
    expect(writes).toContainEqual({ id: 'b', position: 1 });
  });
});

describe('reading a drop', () => {
  // Two rows, 100px tall each, stacked.
  const rows = [
    { id: 'a', parentId: null, index: 0, top: 0, bottom: 100 },
    { id: 'b', parentId: null, index: 1, top: 100, bottom: 200 },
  ];

  it('reads the top band as "before this row"', () => {
    expect(dropTarget(rows, 10)).toEqual({ kind: 'before', overId: 'a', parentId: null, index: 0 });
  });

  it('reads the bottom band as "after this row", which is the next index', () => {
    expect(dropTarget(rows, 90)).toEqual({ kind: 'after', overId: 'a', parentId: null, index: 1 });
  });

  it('reads the middle band as "inside this row"', () => {
    // The parent becomes the row itself, and it lands first among its children.
    expect(dropTarget(rows, 50)).toEqual({ kind: 'inside', overId: 'a', parentId: 'a', index: 0 });
  });

  it('keeps the bands at 30/40/30', () => {
    expect(dropTarget(rows, 29).kind).toBe('before');
    expect(dropTarget(rows, 31).kind).toBe('inside');
    expect(dropTarget(rows, 69).kind).toBe('inside');
    expect(dropTarget(rows, 71).kind).toBe('after');
  });

  it('carries the row it landed on, not the first one', () => {
    expect(dropTarget(rows, 150)).toEqual({ kind: 'inside', overId: 'b', parentId: 'b', index: 0 });
  });

  it('returns nothing when the pointer is off the list', () => {
    expect(dropTarget(rows, -20)).toBeNull();
    expect(dropTarget(rows, 500)).toBeNull();
    expect(dropTarget([], 50)).toBeNull();
  });

  it('ignores a row with no height rather than dividing by zero', () => {
    expect(dropTarget([{ id: 'x', parentId: null, index: 0, top: 40, bottom: 40 }], 40)).toBeNull();
  });
});

describe('text direction', () => {
  it('reads a Hebrew title as right-to-left', () => {
    expect(directionOf('הכרעה: כשרות וימי פתיחה')).toBe('rtl');
  });

  it('reads an English title as left-to-right', () => {
    expect(directionOf('Alcohol licence')).toBe('ltr');
  });

  it('ignores leading digits and punctuation', () => {
    expect(directionOf('2026 — תאריך לטעימות')).toBe('rtl');
    expect(directionOf('2026 — tasting date')).toBe('ltr');
  });

  it('takes the first strong character, not the majority', () => {
    // A Hebrew task whose description happens to open in English still has a
    // Hebrew title; only the title is ever passed in.
    expect(directionOf('Wi-Fi לעסק')).toBe('ltr');
    expect(directionOf('רישיון Wi-Fi')).toBe('rtl');
  });

  it('falls back to left-to-right for text with no strong character', () => {
    expect(directionOf('123 — 456')).toBe('ltr');
    expect(directionOf('')).toBe('ltr');
    expect(directionOf(undefined)).toBe('ltr');
    expect(directionOf(null)).toBe('ltr');
  });
});

describe('items', () => {
  it('knows its own vocabulary', () => {
    expect(STATUSES).toEqual(['todo', 'doing', 'waiting', 'done', 'dropped']);
    expect(isStatus('waiting')).toBe(true);
    expect(isStatus('blocked')).toBe(false);
    expect(isStatus('done')).toBe(true);
  });

  it('treats done and dropped as closed', () => {
    expect(isOpen(item({ status: 'todo' }))).toBe(true);
    expect(isOpen(item({ status: 'waiting' }))).toBe(true);
    expect(isOpen(item({ status: 'done' }))).toBe(false);
    expect(isOpen(item({ status: 'dropped' }))).toBe(false);
  });

  it('never calls a closed item overdue, however late it was', () => {
    const late = { due: '2026-01-01' };
    expect(isOverdue(item({ ...late, status: 'todo' }), '2026-09-17')).toBe(true);
    expect(isOverdue(item({ ...late, status: 'waiting' }), '2026-09-17')).toBe(true);
    expect(isOverdue(item({ ...late, status: 'done' }), '2026-09-17')).toBe(false);
    expect(isOverdue(item({ ...late, status: 'dropped' }), '2026-09-17')).toBe(false);
  });

  it('never calls an undated item overdue', () => {
    expect(isOverdue(item({ due: null }), '2026-09-17')).toBe(false);
    expect(isOverdue(item({ due: undefined }), '2026-09-17')).toBe(false);
  });

  it('does not call something due today overdue', () => {
    expect(isOverdue(item({ due: '2026-09-17' }), '2026-09-17')).toBe(false);
    expect(isOverdue(item({ due: '2026-09-16' }), '2026-09-17')).toBe(true);
  });

  it('reports days until due, null when undated', () => {
    expect(daysUntilDue(item({ due: '2026-09-20' }), '2026-09-17')).toBe(3);
    expect(daysUntilDue(item({ due: '2026-09-10' }), '2026-09-17')).toBe(-7);
    expect(daysUntilDue(item({ due: null }), '2026-09-17')).toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe('bands', () => {
  const today = '2026-09-17';

  it('folds overdue into now rather than giving it a band', () => {
    expect(BANDS).not.toContain('overdue');
    expect(bandOf(item({ due: '2026-08-01' }), today)).toBe('now');
    expect(bandOf(item({ due: today }), today)).toBe('now');
  });

  it('puts waiting in its own band whatever its due date', () => {
    // Waiting changes what you can do about it, which is nothing. That is why it
    // is kept out of the actionable list even when it is overdue.
    expect(bandOf(item({ status: 'waiting', due: '2026-08-01' }), today)).toBe('waiting');
    expect(bandOf(item({ status: 'waiting', due: '2027-01-01' }), today)).toBe('waiting');
    expect(bandOf(item({ status: 'waiting', due: null }), today)).toBe('waiting');
  });

  it('splits now from next exactly at the horizon', () => {
    expect(NOW_HORIZON_DAYS).toBe(14);
    expect(bandOf(item({ due: addDays(today, 14) }), today)).toBe('now');
    expect(bandOf(item({ due: addDays(today, 15) }), today)).toBe('next');
  });

  it('puts undated work in someday unless it is already being done', () => {
    expect(bandOf(item({ due: null, status: 'todo' }), today)).toBe('someday');
    expect(bandOf(item({ due: null, status: 'doing' }), today)).toBe('now');
  });

  it('closes done and dropped regardless of dates', () => {
    expect(bandOf(item({ status: 'done', due: '2026-01-01' }), today)).toBe('closed');
    expect(bandOf(item({ status: 'dropped', due: null }), today)).toBe('closed');
  });

  it('honours a custom horizon', () => {
    expect(bandOf(item({ due: addDays(today, 20) }), today, 30)).toBe('now');
    expect(bandOf(item({ due: addDays(today, 20) }), today, 7)).toBe('next');
  });

  it('groups every item into exactly one band', () => {
    const items = [
      item({ id: 'a', due: '2026-08-01' }),
      item({ id: 'b', due: '2027-01-01' }),
      item({ id: 'c', status: 'waiting' }),
      item({ id: 'd', due: null }),
      item({ id: 'e', status: 'done' }),
    ];
    const groups = groupItems(items, today);
    expect(Object.keys(groups)).toEqual(BANDS);
    expect(groups.now.map((i) => i.id)).toEqual(['a']);
    expect(groups.next.map((i) => i.id)).toEqual(['b']);
    expect(groups.waiting.map((i) => i.id)).toEqual(['c']);
    expect(groups.someday.map((i) => i.id)).toEqual(['d']);
    expect(groups.closed.map((i) => i.id)).toEqual(['e']);
    expect(Object.values(groups).flat()).toHaveLength(items.length);
  });

  it('sorts dated before undated, soonest first, then position, then title', () => {
    const items = [
      item({ id: 'undated-b', due: null, title: 'B' }),
      item({ id: 'undated-a', due: null, title: 'A' }),
      item({ id: 'late', due: '2026-12-01' }),
      item({ id: 'soon', due: '2026-09-18' }),
    ];
    expect([...items].sort(compareItems).map((i) => i.id))
      .toEqual(['soon', 'late', 'undated-a', 'undated-b']);
  });

  it('breaks ties on position before title', () => {
    const items = [
      item({ id: 'z', due: '2026-09-18', position: 1, title: 'Z' }),
      item({ id: 'a', due: '2026-09-18', position: 2, title: 'A' }),
    ];
    expect([...items].sort(compareItems).map((i) => i.id)).toEqual(['z', 'a']);
  });

  it('is a total order, so the list never flickers between reads', () => {
    const items = [
      item({ id: 'x', due: null, title: 'Same' }),
      item({ id: 'y', due: null, title: 'Same' }),
    ];
    expect(compareItems(items[0], items[1])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('budget', () => {
  it('derives spend per item from the ledger', () => {
    const payments = [
      payment({ id: 'p1', itemId: 'i1', gross: 50000 }),
      payment({ id: 'p2', itemId: 'i1', gross: 25000 }),
      payment({ id: 'p3', itemId: 'i2', gross: 90000 }),
    ];
    expect(spentOn('i1', payments)).toBe(75000);
    expect(spentOn('i2', payments)).toBe(90000);
    expect(spentOn('i3', payments)).toBe(0);
  });

  it('nets a refund off rather than deleting history', () => {
    const payments = [
      payment({ id: 'p1', itemId: 'i1', gross: 50000 }),
      payment({ id: 'p2', itemId: 'i1', gross: -20000 }),
    ];
    expect(spentOn('i1', payments)).toBe(30000);
  });

  it('totals planned against actual', () => {
    const items = [
      item({ id: 'i1', planned: 100000 }),
      item({ id: 'i2', planned: 500000 }),
    ];
    const payments = [
      payment({ itemId: 'i1', gross: 120000 }),
      payment({ itemId: 'i2', gross: 450000 }),
    ];
    const summary = summariseBudget(items, payments);
    expect(summary.planned).toBe(600000);
    expect(summary.actual).toBe(570000);
    expect(summary.variance).toBe(-30000); // under budget
  });

  it('counts a dropped item’s spend but not its plan', () => {
    // Abandoning a plan means you will not spend the money. A non-refundable
    // deposit you already paid is gone whatever you decided afterwards.
    const items = [item({ id: 'i1', status: 'dropped', planned: 100000 })];
    const payments = [payment({ itemId: 'i1', gross: 15000 })];
    const summary = summariseBudget(items, payments);
    expect(summary.planned).toBe(0);
    expect(summary.actual).toBe(15000);
    expect(summary.variance).toBe(15000);
  });

  it('still counts the plan of a done item', () => {
    const items = [item({ id: 'i1', status: 'done', planned: 100000 })];
    expect(summariseBudget(items, []).planned).toBe(100000);
  });

  it('names over-budget as a positive variance', () => {
    const items = [item({ id: 'i1', planned: 100000 })];
    const payments = [payment({ itemId: 'i1', gross: 130000 })];
    expect(summariseBudget(items, payments).variance).toBe(30000);
  });

  it('has no per-area breakdown, because the parts would not sum', () => {
    // A task can carry several domains, so any per-domain total counts a
    // multi-domain cost more than once. A figure that does not add up is worse
    // than no figure.
    const summary = summariseBudget([item({ id: 'i1', planned: 10000 })], []);
    expect(summary).not.toHaveProperty('byCategory');
    expect(Object.keys(summary).sort()).toEqual(['actual', 'planned', 'variance']);
  });

  it('does not lose a payment whose item it has never seen', () => {
    // A payment must never vanish from the total just because its item was not
    // in the list handed in.
    const summary = summariseBudget([], [payment({ itemId: 'ghost', gross: 4200 })]);
    expect(summary.actual).toBe(4200);
  });

  it('handles an empty board', () => {
    expect(summariseBudget([], [])).toEqual({ planned: 0, actual: 0, variance: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('heroState', () => {
  const today = '2026-09-17';

  it('counts down to a target date', () => {
    const hero = heroState({ targetOpenDate: '2026-12-01' }, [], today);
    expect(hero.kind).toBe('countdown');
    expect(hero.days).toBe(75);
  });

  it('knows opening day itself', () => {
    expect(heroState({ targetOpenDate: today }, [], today)).toMatchObject({ kind: 'today', days: 0 });
  });

  it('reports a target that has passed as days over', () => {
    const hero = heroState({ targetOpenDate: '2026-09-10' }, [], today);
    expect(hero.kind).toBe('overdue');
    expect(hero.days).toBe(7);
  });

  it('falls back to what is left when no date is set', () => {
    // It must never render a countdown to a date nobody chose.
    const items = [item({ id: 'a' }), item({ id: 'b', status: 'done' })];
    const hero = heroState({ targetOpenDate: null }, items, today);
    expect(hero.kind).toBe('remaining');
    expect(hero.open).toBe(1);
    expect(hero.days).toBeUndefined();
  });

  it('ignores a target that is not a real date', () => {
    expect(heroState({ targetOpenDate: 'soon' }, [], today).kind).toBe('remaining');
    expect(heroState({}, [], today).kind).toBe('remaining');
    expect(heroState(null, [], today).kind).toBe('remaining');
  });

  it('carries the open and overdue counts in every state', () => {
    const items = [
      item({ id: 'a', due: '2026-01-01' }),
      item({ id: 'b' }),
      item({ id: 'c', status: 'done', due: '2026-01-01' }),
    ];
    for (const target of ['2026-12-01', today, '2026-01-01', null]) {
      const hero = heroState({ targetOpenDate: target }, items, today);
      expect(hero.open).toBe(2);
      expect(hero.overdue).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
describe('normaliseSettings', () => {
  it('fills in the defaults', () => {
    expect(normaliseSettings()).toEqual({
      timezone: 'Asia/Jerusalem', vatRateBp: 1800, targetOpenDate: null,
    });
  });

  it('keeps good values and discards bad ones', () => {
    expect(normaliseSettings({ timezone: 'UTC', vatRateBp: 1700, targetOpenDate: '2026-12-01' }))
      .toEqual({ timezone: 'UTC', vatRateBp: 1700, targetOpenDate: '2026-12-01' });
    expect(normaliseSettings({ timezone: '', vatRateBp: -1, targetOpenDate: 'nope' }))
      .toEqual({ timezone: 'Asia/Jerusalem', vatRateBp: 1800, targetOpenDate: null });
    expect(normaliseSettings({ vatRateBp: 17.5 }).vatRateBp).toBe(1800);
  });

  it('allows a zero VAT rate, which is not the same as no rate', () => {
    expect(normaliseSettings({ vatRateBp: 0 }).vatRateBp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('lockout', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');

  it('costs nothing for the first four attempts', () => {
    // Getting a PIN wrong is overwhelmingly a member of staff with cold hands.
    for (let attempts = 0; attempts < 4; attempts += 1) {
      expect(registerFailure({ failedAttempts: attempts }, now).lockedUntil).toBe(null);
    }
  });

  it('locks for a minute on the fifth, then doubles', () => {
    const minutes = (attempts) => {
      const { lockedUntil } = registerFailure({ failedAttempts: attempts - 1 }, now);
      return (Date.parse(lockedUntil) - now) / 60000;
    };
    expect(minutes(5)).toBe(1);
    expect(minutes(6)).toBe(2);
    expect(minutes(7)).toBe(4);
    expect(minutes(8)).toBe(8);
    expect(minutes(9)).toBe(16);
    expect(minutes(10)).toBe(32);
  });

  it('caps the lockout at an hour', () => {
    for (const attempts of [11, 12, 40, 500]) {
      const { lockedUntil } = registerFailure({ failedAttempts: attempts - 1 }, now);
      expect((Date.parse(lockedUntil) - now) / 60000).toBe(LOCKOUT_MAX_MINUTES);
    }
  });

  it('starts from nothing for a user who has never failed', () => {
    expect(registerFailure(undefined, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
    expect(registerFailure({}, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
  });

  it('reads a live lock, and lets an expired one through', () => {
    expect(isLockedOut({ lockedUntil: '2026-09-17T12:05:00Z' }, now)).toBe(true);
    expect(isLockedOut({ lockedUntil: '2026-09-17T11:55:00Z' }, now)).toBe(false);
    expect(isLockedOut({ lockedUntil: null }, now)).toBe(false);
    expect(isLockedOut({}, now)).toBe(false);
    expect(isLockedOut(undefined, now)).toBe(false);
    expect(isLockedOut({ lockedUntil: 'rubbish' }, now)).toBe(false);
  });

  it('clears on success', () => {
    expect(clearFailures()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});

// ---------------------------------------------------------------------------
describe('validation', () => {
  it('requires a PIN of at least six digits', () => {
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('12345a')).toBe(false);
    expect(isValidPin('')).toBe(false);
    expect(isValidPin(123456)).toBe(false);
    expect(isValidPin(null)).toBe(false);
  });

  it('accepts sane usernames only', () => {
    expect(isValidUsername('adir')).toBe(true);
    expect(isValidUsername('bar-staff_2')).toBe(true);
    expect(isValidUsername('a')).toBe(false); // too short
    expect(isValidUsername('-adir')).toBe(false); // must start alphanumeric
    expect(isValidUsername('Adir')).toBe(false); // lowercase only
    expect(isValidUsername('adir danan')).toBe(false);
    expect(isValidUsername('a'.repeat(31))).toBe(false);
    expect(isValidUsername(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('domains', () => {
  it('reads the list on the task', () => {
    const task = item({ domains: ['coffee', 'finance'] });
    expect(hasDomain(task, 'coffee')).toBe(true);
    expect(hasDomain(task, 'kitchen')).toBe(false);
    expect(hasDomain(item({ domains: [] }), 'coffee')).toBe(false);
    expect(hasDomain({}, 'coffee')).toBe(false);
  });

  it('shows a task on every page it belongs to', () => {
    // The espresso machine contract is genuinely Coffee and Finance. Forcing it
    // to choose is how it goes missing from whichever page somebody opens.
    const items = [
      item({ id: 'a', domains: ['coffee', 'finance'] }),
      item({ id: 'b', domains: ['kitchen'] }),
      item({ id: 'c', domains: [] }),
    ];
    expect(inDomain(items, 'coffee').map((i) => i.id)).toEqual(['a']);
    expect(inDomain(items, 'finance').map((i) => i.id)).toEqual(['a']);
    expect(inDomain(items, 'kitchen').map((i) => i.id)).toEqual(['b']);
    expect(inDomain(items, 'brand')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('subtasks', () => {
  const step = (over = {}) => ({ id: over.id ?? 's1', itemId: over.itemId ?? 'i1', title: over.title ?? 'Step', done: over.done ?? false, position: over.position ?? 0, ...over });

  it('counts progress', () => {
    expect(subtaskProgress([step({ done: true }), step({ id: 's2' })]))
      .toEqual({ done: 1, total: 2, fraction: 0.5 });
    expect(subtaskProgress([step({ done: true })]))
      .toEqual({ done: 1, total: 1, fraction: 1 });
  });

  it('treats no steps as unmeasured rather than zero per cent', () => {
    // total is what tells the two apart, so the ring can draw an empty track
    // instead of a circle of failure.
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0, fraction: 0 });
    expect(subtaskProgress()).toEqual({ done: 0, total: 0, fraction: 0 });
  });

  it('picks out and orders one task’s steps', () => {
    const steps = [
      step({ id: 'b', itemId: 'i1', position: 2 }),
      step({ id: 'a', itemId: 'i1', position: 1 }),
      step({ id: 'z', itemId: 'i2', position: 0 }),
    ];
    expect(subtasksOf('i1', steps).map((s) => s.id)).toEqual(['a', 'b']);
    expect(subtasksOf('nobody', steps)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('completing a task', () => {
  it('requires a conclusion before done', () => {
    expect(canComplete({ conclusion: 'Granted on the second attempt.' })).toBe(true);
    expect(canComplete({ conclusion: '' })).toBe(false);
    expect(canComplete({ conclusion: '   ' })).toBe(false);
    expect(canComplete({})).toBe(false);
    expect(canComplete(null)).toBe(false);
  });

  it('only blocks the done status', () => {
    expect(completionProblem({ status: 'done', conclusion: '' })).toBe(CONCLUSION_REQUIRED);
    expect(completionProblem({ status: 'done', conclusion: 'Done it.' })).toBe(null);
    expect(completionProblem({ status: 'doing', conclusion: '' })).toBe(null);
    expect(completionProblem({ status: 'waiting', conclusion: '' })).toBe(null);
  });

  it('exempts dropped, because abandoning is not an outcome to write up', () => {
    // Demanding a conclusion here would only teach people to type a full stop.
    expect(completionProblem({ status: 'dropped', conclusion: '' })).toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe('the edit lease', () => {
  const now = Date.parse('2026-09-18T12:00:00Z');
  const held = (by, atMs) => ({ lockedBy: by, lockedAt: new Date(atMs).toISOString() });

  it('is free when nobody holds it', () => {
    expect(lockState({ lockedBy: null, lockedAt: null }, 'me', now))
      .toEqual({ locked: false, mine: false, holderId: null });
    expect(canEdit({}, 'me', now)).toBe(true);
  });

  it('knows whose it is', () => {
    expect(lockState(held('ada', now - 1000), 'me', now))
      .toEqual({ locked: true, mine: false, holderId: 'ada' });
    expect(lockState(held('me', now - 1000), 'me', now))
      .toEqual({ locked: true, mine: true, holderId: 'me' });
  });

  it('lets the holder through and keeps everyone else out', () => {
    expect(canEdit(held('me', now - 1000), 'me', now)).toBe(true);
    expect(canEdit(held('ada', now - 1000), 'me', now)).toBe(false);
  });

  it('expires on its own, so a shut laptop never locks a task forever', () => {
    expect(LOCK_LEASE_MS).toBe(60_000);
    expect(canEdit(held('ada', now - LOCK_LEASE_MS + 1000), 'me', now)).toBe(false);
    expect(canEdit(held('ada', now - LOCK_LEASE_MS), 'me', now)).toBe(true);
    expect(canEdit(held('ada', now - 3600_000), 'me', now)).toBe(true);
  });

  it('ignores a lock with no holder or an unreadable time', () => {
    expect(canEdit({ lockedBy: null, lockedAt: new Date(now).toISOString() }, 'me', now)).toBe(true);
    expect(canEdit({ lockedBy: 'ada', lockedAt: 'rubbish' }, 'me', now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('summarisePeople', () => {
  const today = '2026-09-18';
  const users = [
    { id: 'u1', displayName: 'Ido' },
    { id: 'u2', displayName: 'Adi' },
  ];

  it('counts each person’s workload', () => {
    const items = [
      item({ id: 'a', owners: ['u1'], status: 'done' }),
      item({ id: 'b', owners: ['u1'] }),
      item({ id: 'c', owners: ['u1'], due: '2026-01-01' }),
      item({ id: 'd', owners: ['u2'] }),
    ];
    const { people } = summarisePeople(items, users, today);
    const ido = people.find((row) => row.user.id === 'u1');
    expect(ido).toMatchObject({ total: 3, done: 1, open: 2, overdue: 1 });
    expect(people.find((row) => row.user.id === 'u2')).toMatchObject({ total: 1, done: 0, open: 1 });
  });

  it('surfaces unowned work rather than hiding it', () => {
    // A task nobody owns is the most likely one to be missed, so a page about
    // who is doing what has to say so out loud.
    const { unassigned } = summarisePeople([item({ id: 'x', owners: [] })], users, today);
    expect(unassigned).toMatchObject({ user: null, total: 1, open: 1 });
  });

  it('puts the busiest person first', () => {
    const items = [
      item({ id: 'a', owners: ['u2'] }),
      item({ id: 'b', owners: ['u2'] }),
      item({ id: 'c', owners: ['u1'] }),
    ];
    expect(summarisePeople(items, users, today).people[0].user.id).toBe('u2');
  });

  it('lists everybody, including people with nothing on', () => {
    expect(summarisePeople([], users, today).people).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
describe('overviewStats', () => {
  const today = '2026-09-18';
  const users = [{ id: 'u1', displayName: 'Ido' }];

  it('reports work and money for the venue', () => {
    const items = [
      item({ id: 'a', owners: ['u1'], status: 'done', planned: 100000 }),
      item({ id: 'b', owners: ['u1'], planned: 50000, due: '2026-01-01' }),
    ];
    const payments = [payment({ itemId: 'a', gross: 90000 })];
    const stats = overviewStats(items, payments, users, { targetOpenDate: '2026-12-01' }, today);

    expect(stats.work).toEqual({ total: 2, done: 1, open: 1, overdue: 1 });
    expect(stats.money.expected).toBe(150000);
    expect(stats.money.spent).toBe(90000);
    expect(stats.money.remaining).toBe(60000);
    expect(stats.hero.kind).toBe('countdown');
  });

  it('never reports a negative amount still to pay', () => {
    // Once actual passes planned there is nothing left to expect — you are
    // simply over, and that is what variance is for.
    const items = [item({ id: 'a', planned: 10000 })];
    const stats = overviewStats(items, [payment({ itemId: 'a', gross: 25000 })], users, {}, today);
    expect(stats.money.remaining).toBe(0);
    expect(stats.money.variance).toBe(15000);
  });

  it('holds up on an empty board', () => {
    const stats = overviewStats([], [], users, {}, today);
    expect(stats.work).toEqual({ total: 0, done: 0, open: 0, overdue: 0 });
    expect(stats.money).toEqual({ expected: 0, spent: 0, remaining: 0, variance: 0 });
    expect(stats.hero.kind).toBe('remaining');
  });
});

// ---------------------------------------------------------------------------
describe('several owners on one task', () => {
  const today = '2026-09-18';
  const users = [
    { id: 'u1', displayName: 'Ido' },
    { id: 'u2', displayName: 'Adi' },
    { id: 'u3', displayName: 'Adir' },
  ];

  it('counts a shared task for every owner', () => {
    // The totals deliberately do not sum to the number of tasks. Three people on
    // the partnership agreement are all three responsible for it, not a third
    // each — this measures what each is carrying, not how work is partitioned.
    const items = [item({ id: 'a', owners: ['u1', 'u2', 'u3'] })];
    const { people } = summarisePeople(items, users, today);
    expect(people.every((row) => row.total === 1 && row.open === 1)).toBe(true);
  });

  it('treats an empty owner list as unowned', () => {
    const { unassigned, people } = summarisePeople([item({ owners: [] })], users, today);
    expect(unassigned.total).toBe(1);
    expect(people.every((row) => row.total === 0)).toBe(true);
  });

  it('filters by owner and by having none', () => {
    const items = [
      item({ id: 'a', owners: ['u1', 'u2'] }),
      item({ id: 'b', owners: ['u2'] }),
      item({ id: 'c', owners: [] }),
    ];
    expect(ownedBy(items, 'u1').map((i) => i.id)).toEqual(['a']);
    expect(ownedBy(items, 'u2').map((i) => i.id)).toEqual(['a', 'b']);
    expect(unowned(items).map((i) => i.id)).toEqual(['c']);
  });
});

// ---------------------------------------------------------------------------
describe('nested steps', () => {
  const step = (id, parentId = null, over = {}) => ({
    id, itemId: 'i1', parentId, title: over.title ?? id, done: over.done ?? false,
    position: over.position ?? 0,
  });

  it('builds a tree', () => {
    const tree = buildSubtaskTree([step('a'), step('a1', 'a'), step('a2', 'a'), step('b')]);
    expect(tree.map((n) => n.id)).toEqual(['a', 'b']);
    expect(tree[0].children.map((n) => n.id)).toEqual(['a1', 'a2']);
    expect(tree[1].children).toEqual([]);
  });

  it('lifts an orphan to the top rather than dropping it', () => {
    // Losing somebody's step because its parent was deleted underneath it is far
    // worse than showing it in the wrong place.
    const tree = buildSubtaskTree([step('a'), step('lost', 'gone')]);
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'lost']);
  });

  it('measures depth from one', () => {
    const rows = [step('a'), step('b', 'a'), step('c', 'b'), step('d', 'c'), step('e', 'd')];
    expect(depthOf('a', rows)).toBe(1);
    expect(depthOf('c', rows)).toBe(3);
    expect(depthOf('e', rows)).toBe(5);
  });

  it('allows five levels and refuses a sixth', () => {
    const rows = [step('a'), step('b', 'a'), step('c', 'b'), step('d', 'c'), step('e', 'd')];
    expect(MAX_SUBTASK_DEPTH).toBe(5);
    expect(canNestUnder(null, rows)).toBe(true);
    expect(canNestUnder('d', rows)).toBe(true);   // the child would be level 5
    expect(canNestUnder('e', rows)).toBe(false);  // the child would be level 6
  });

  it('counts every step at any depth towards progress', () => {
    const rows = [step('a', null, { done: true }), step('b', 'a'), step('c', 'b', { done: true })];
    expect(subtaskProgress(rows)).toEqual({ done: 2, total: 3, fraction: 2 / 3 });
  });
});

// ---------------------------------------------------------------------------
describe('the shared fund', () => {
  const users = [
    { id: 'u1', displayName: 'Ido' },
    { id: 'u2', displayName: 'Adi' },
  ];
  const dep = (userId, amount, depositedOn) => ({ id: `${userId}${amount}`, userId, amount, depositedOn });

  it('sums the pot and splits it by person', () => {
    const fund = summariseFund([
      dep('u1', 100000, '2026-09-01'),
      dep('u2', 50000, '2026-09-02'),
      dep('u1', 25000, '2026-09-03'),
    ], users, 0);

    expect(fund.balance).toBe(175000);
    expect(fund.people.find((p) => p.user.id === 'u1')).toMatchObject({ total: 125000, count: 2 });
    expect(fund.people.find((p) => p.user.id === 'u2')).toMatchObject({ total: 50000, count: 1 });
  });

  it('treats a withdrawal as a negative deposit', () => {
    // The pot is a ledger: editing history away loses the record of what moved.
    const fund = summariseFund([dep('u1', 100000, '2026-09-01'), dep('u1', -30000, '2026-09-05')], users, 0);
    expect(fund.balance).toBe(70000);
    expect(fund.people[0].count).toBe(2);
  });

  it('builds a cumulative series, one point per day that moved', () => {
    const fund = summariseFund([
      dep('u1', 10000, '2026-09-03'),
      dep('u2', 5000, '2026-09-01'),
      dep('u1', 5000, '2026-09-01'),
    ], users, 0);

    expect(fund.series).toEqual([
      { date: '2026-09-01', change: 10000, balance: 10000 },
      { date: '2026-09-03', change: 10000, balance: 20000 },
    ]);
  });

  it('reports progress only when a target is set', () => {
    const none = summariseFund([dep('u1', 50000, '2026-09-01')], users, 0);
    expect(none.fraction).toBe(0);
    expect(none.remaining).toBe(0);

    const some = summariseFund([dep('u1', 50000, '2026-09-01')], users, 200000);
    expect(some.fraction).toBe(0.25);
    expect(some.remaining).toBe(150000);
  });

  it('caps a full pot at one and never owes a negative remainder', () => {
    const over = summariseFund([dep('u1', 300000, '2026-09-01')], users, 200000);
    expect(over.fraction).toBe(1);
    expect(over.remaining).toBe(0);
  });

  it('holds up with nothing in it', () => {
    const fund = summariseFund([], users, 0);
    expect(fund.balance).toBe(0);
    expect(fund.series).toEqual([]);
    expect(fund.people).toHaveLength(2);
  });
});
