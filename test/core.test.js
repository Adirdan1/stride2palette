import { describe, expect, it } from 'vitest';
import {
  BANDS,
  CATEGORIES,
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
  isCategory,
  isDate,
  isLockedOut,
  isOpen,
  isOverdue,
  isStatus,
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
  category: over.category ?? 'other',
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
describe('items', () => {
  it('knows its own vocabulary', () => {
    expect(STATUSES).toEqual(['todo', 'doing', 'waiting', 'done', 'dropped']);
    expect(isStatus('waiting')).toBe(true);
    expect(isStatus('blocked')).toBe(false);
    expect(isCategory('licence')).toBe(true);
    expect(isCategory('license')).toBe(false); // deliberately the British spelling
    expect(CATEGORIES).toContain('permit');
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
      item({ id: 'i1', category: 'licence', planned: 100000 }),
      item({ id: 'i2', category: 'equipment', planned: 500000 }),
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

  it('breaks down by category, busiest first', () => {
    const items = [
      item({ id: 'i1', category: 'licence', planned: 10000 }),
      item({ id: 'i2', category: 'equipment', planned: 20000 }),
    ];
    const payments = [
      payment({ itemId: 'i1', gross: 5000 }),
      payment({ itemId: 'i2', gross: 80000 }),
    ];
    const { byCategory } = summariseBudget(items, payments);
    expect(byCategory.map((c) => c.category)).toEqual(['equipment', 'licence']);
    expect(byCategory[0]).toEqual({ category: 'equipment', planned: 20000, actual: 80000 });
  });

  it('does not lose a payment whose item it has never seen', () => {
    // A payment must never vanish from the total just because its item was not
    // in the list handed in.
    const summary = summariseBudget([], [payment({ itemId: 'ghost', gross: 4200 })]);
    expect(summary.actual).toBe(4200);
    expect(summary.byCategory.find((c) => c.category === 'other').actual).toBe(4200);
  });

  it('handles an empty board', () => {
    expect(summariseBudget([], [])).toEqual({
      planned: 0, actual: 0, variance: 0, byCategory: [],
    });
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
