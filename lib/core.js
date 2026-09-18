/**
 * stride2palette core logic.
 *
 * Everything in this file is pure. No Supabase client, no network, no
 * `new Date()` without an explicit `now` passed in, and — per the collection's
 * most load-bearing convention — no imports at all.
 *
 * The invariants (see README):
 *   1. Actual spend is derived from the payments ledger, never stored.
 *   2. Planned spend and the VAT rate are frozen onto rows at write time.
 *   3. An item with no due date is undated, not overdue.
 *   4. Money is an integer count of agorot. Never a float, anywhere.
 *   5. Dates are local calendar dates, formatted YYYY-MM-DD.
 */

// ---------------------------------------------------------------------------
// Dates
//
// A date here is a calendar date: the string "2026-09-17". It is not an instant.
// Arithmetic uses UTC internally *only* because UTC has no DST, which makes it a
// safe integer axis for day counting. A local timezone is involved in exactly one
// place: deciding which calendar date a given instant falls on (`todayIn`).
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value) {
  return typeof value === 'string' && DATE_RE.test(value);
}

function assertDate(value, label = 'date') {
  if (!isDate(value)) throw new TypeError(`${label} must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  return value;
}

/** Calendar date -> day number (days since epoch). Inverse of `fromDayNumber`. */
export function toDayNumber(date) {
  assertDate(date);
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Day number -> calendar date. Inverse of `toDayNumber`. */
export function fromDayNumber(n) {
  const d = new Date(n * 86400000);
  return [
    String(d.getUTCFullYear()).padStart(4, '0'),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function addDays(date, n) {
  return fromDayNumber(toDayNumber(date) + n);
}

/** Signed day count from `a` to `b`. Positive when `b` is later. */
export function daysBetween(a, b) {
  return toDayNumber(b) - toDayNumber(a);
}

/**
 * The calendar date that `now` falls on, in `timeZone`.
 *
 * This is the only timezone-aware function in the codebase, and the only place a
 * UTC conversion could ever shift a day boundary. `en-CA` is used because it
 * formats as YYYY-MM-DD, but the parts are reassembled by hand rather than
 * trusted.
 */
export function todayIn(timeZone = 'Asia/Jerusalem', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ---------------------------------------------------------------------------
// Money
//
// An amount is an integer count of agorot. One hundred agorot is one shekel.
// Nothing here ever produces a float: `numeric` in Postgres would also be exact,
// but an integer is exact *and* cannot be quietly widened on a JSON round trip.
//
// VAT rates are basis points — 1800 is 18% — for the same reason.
// ---------------------------------------------------------------------------

export const DEFAULT_VAT_RATE_BP = 1800;

export function isAgorot(value) {
  return Number.isSafeInteger(value);
}

function assertAgorot(value, label = 'amount') {
  if (!isAgorot(value)) throw new TypeError(`${label} must be an integer of agorot, got ${JSON.stringify(value)}`);
  return value;
}

/**
 * Split a gross amount into the net and the VAT inside it.
 *
 * Amounts are entered gross, as they appear on the invoice, so VAT is extracted
 * rather than added: for a rate r, vat = gross * r / (100% + r).
 *
 * The rounding happens once, on the VAT, and net is whatever is left over. Doing
 * it the other way — rounding both independently — lets the two parts fail to sum
 * back to the total, and a budget that is off by an agora looks broken even when
 * every figure in it is defensible.
 */
export function vatSplit(gross, rateBp = DEFAULT_VAT_RATE_BP) {
  assertAgorot(gross, 'gross');
  assertAgorot(rateBp, 'rateBp');
  if (rateBp < 0) throw new RangeError('rateBp must not be negative');

  const vat = Math.round((gross * rateBp) / (10000 + rateBp));
  return { gross, vat, net: gross - vat };
}

/**
 * Parse what a person typed into agorot.
 *
 * Accepts "1180", "1180.50", "1,180.50", "₪1,180.50" and a leading minus, because
 * a refund is a negative payment. Returns null for anything it cannot read, which
 * the caller is expected to treat as a validation failure rather than as zero —
 * silently reading an unparseable amount as nothing is how a budget quietly
 * stops matching reality.
 */
export function parseAgorot(input) {
  if (typeof input === 'number') return Number.isSafeInteger(input * 100) ? Math.round(input * 100) : null;
  if (typeof input !== 'string') return null;

  const cleaned = input.replace(/[\s, ₪]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith('-');
  const [whole, fraction = ''] = (negative ? cleaned.slice(1) : cleaned).split('.');
  const agorot = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(agorot)) return null;
  return negative ? -agorot : agorot;
}

// ---------------------------------------------------------------------------
// Text direction
// ---------------------------------------------------------------------------

/** Ranges that are strongly right-to-left: Hebrew, Arabic, Syriac, Thaana,
 *  and the Arabic presentation forms. */
const RTL = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Latin, Greek and Cyrillic letters — strongly left-to-right. */
const LTR = /[A-Za-z\u00C0-\u02AF\u0370-\u04FF]/;

/**
 * The direction a piece of text should be laid out in, from its first strongly
 * directional character. Digits and punctuation decide nothing, so a title that
 * opens with a number takes its direction from the first real word.
 *
 * This exists because `dir="auto"` cannot be trusted on a container here. The
 * browser's sniff skips any descendant that carries its own `dir`, and in a task
 * row every string worth reading has one — so the row ended up taking its
 * direction from whatever was left over: the owners line, or the English word
 * "Conclusion". A Hebrew task then kept its ring, spine and indent on the side
 * the reader finishes at. Deciding from the title is both correct and stable:
 * the title is what the row is about.
 */
export function directionOf(text) {
  const s = typeof text === 'string' ? text : '';
  for (const ch of s) {
    if (RTL.test(ch)) return 'rtl';
    if (LTR.test(ch)) return 'ltr';
  }
  return 'ltr';
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * `waiting` is deliberately its own status rather than a flavour of `doing`.
 * A permit sitting with the municipality is not work nobody has started, and
 * telling those two apart is most of what this app is for: one means *do
 * something*, the other means *you have done your part*.
 */
export const STATUSES = ['todo', 'doing', 'waiting', 'done', 'dropped'];

/** Closed means "off the board". `dropped` is closed without having happened. */
export const CLOSED_STATUSES = ['done', 'dropped'];

/**
 * Domains are the areas of responsibility the venue is divided into, and each
 * one is a page. They live in the database rather than here because adding a
 * seventh should not need a migration and a deploy — so core is handed the list
 * rather than owning it.
 *
 * A task can carry several. A supplier contract for the espresso machine is
 * genuinely Coffee and Finance at once, and making it choose means it goes
 * missing from one of the two pages somebody is looking at.
 */
export function hasDomain(item, domain) {
  return Array.isArray(item.domains) && item.domains.includes(domain);
}

export function inDomain(items, domain) {
  return items.filter((item) => hasDomain(item, domain));
}

export function isStatus(value) {
  return STATUSES.includes(value);
}

export function isOpen(item) {
  return !CLOSED_STATUSES.includes(item.status);
}

/**
 * Overdue is a property of open items with a due date that has passed.
 *
 * A closed item is never overdue however late it was — the board is about what is
 * still in the way, and scolding someone for a licence they already have is
 * noise. An item with no due date is never overdue either (invariant 3): undated
 * is a deliberate state here, not a missing value to be filled in with a guess.
 */
export function isOverdue(item, today) {
  if (!isOpen(item) || !isDate(item.due)) return false;
  return daysBetween(today, item.due) < 0;
}

/** Days until an item is due. Null when undated, negative when overdue. */
export function daysUntilDue(item, today) {
  return isDate(item.due) ? daysBetween(today, item.due) : null;
}

// ---------------------------------------------------------------------------
// Bands
//
// Bands rather than a flat sort, following stride2do. Overdue folds into NOW
// rather than getting a band of its own: a thing that was due last Tuesday is the
// same work as a thing due tomorrow, just later, and a separate OVERDUE band
// makes the page longer without making the decision easier.
//
// WAITING *is* its own band, because unlike overdue it changes what you can do
// about it — which is nothing. Keeping it out of NOW is what stops the actionable
// list filling up with things that are already someone else's move.
// ---------------------------------------------------------------------------

export const NOW_HORIZON_DAYS = 14;

export const BANDS = ['now', 'next', 'waiting', 'someday', 'closed'];

export function bandOf(item, today, horizon = NOW_HORIZON_DAYS) {
  if (!isOpen(item)) return 'closed';
  if (item.status === 'waiting') return 'waiting';

  const due = daysUntilDue(item, today);
  if (due === null) return item.status === 'doing' ? 'now' : 'someday';
  return due <= horizon ? 'now' : 'next';
}

/**
 * Order within a band: dated before undated, soonest first, then the manual
 * position, then the title so the order is total and never flickers between
 * reads.
 */
export function compareItems(a, b) {
  const aDue = isDate(a.due) ? toDayNumber(a.due) : Infinity;
  const bDue = isDate(b.due) ? toDayNumber(b.due) : Infinity;
  if (aDue !== bDue) return aDue - bDue;

  const aPos = a.position ?? 0;
  const bPos = b.position ?? 0;
  if (aPos !== bPos) return aPos - bPos;

  return String(a.title).localeCompare(String(b.title));
}

export function groupItems(items, today, horizon = NOW_HORIZON_DAYS) {
  const groups = Object.fromEntries(BANDS.map((band) => [band, []]));
  for (const item of items) groups[bandOf(item, today, horizon)].push(item);
  for (const band of BANDS) groups[band].sort(compareItems);
  return groups;
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/**
 * Total spend against one item. Derived, always — there is no `actual` column.
 *
 * Payments can be negative: a withdrawn application that refunds its fee is a
 * negative payment rather than a deleted one, so the history of what actually
 * moved stays intact.
 */
export function spentOn(itemId, payments) {
  let total = 0;
  for (const payment of payments) {
    if (payment.itemId === itemId) total += payment.gross;
  }
  return total;
}

/**
 * Planned versus actual, for the venue.
 *
 * There is deliberately no breakdown by area. A task can belong to several
 * domains at once — the espresso machine contract is Coffee and Finance — so
 * any per-domain total would count its cost more than once and the parts would
 * not sum to the whole. A figure that does not add up is worse than no figure.
 *
 * Dropped items contribute their *actual* spend but not their *planned* spend.
 * That asymmetry is the point: abandoning a plan means you are no longer going to
 * spend the money, but a non-refundable deposit you already paid is gone whatever
 * you decided afterwards. Counting its plan would inflate the budget; ignoring its
 * payments would hide real money.
 */
export function summariseBudget(items, payments) {
  let planned = 0;
  for (const item of items) {
    if (item.status !== 'dropped') planned += item.planned ?? 0;
  }

  let actual = 0;
  for (const payment of payments) actual += payment.gross;

  return {
    planned,
    actual,
    // Positive means over budget. Named for the direction that costs you money,
    // because that is the one anybody reads the number to find out about.
    variance: actual - planned,
  };
}

// ---------------------------------------------------------------------------
// The hero
// ---------------------------------------------------------------------------

/**
 * What the top of the screen says.
 *
 * With a target date it counts down. Without one it falls back to the number of
 * things still in the way, and becomes a countdown the moment a date is set. It
 * must never render a countdown to a date nobody chose — a made-up opening day
 * shown in the largest type on the screen is worse than no opening day at all.
 */
export function heroState(settings, items, today) {
  const open = items.filter(isOpen).length;
  const overdue = items.filter((item) => isOverdue(item, today)).length;
  const target = settings?.targetOpenDate;

  if (!isDate(target)) return { kind: 'remaining', open, overdue };

  const days = daysBetween(today, target);
  if (days > 0) return { kind: 'countdown', days, open, overdue, target };
  if (days === 0) return { kind: 'today', days: 0, open, overdue, target };
  return { kind: 'overdue', days: -days, open, overdue, target };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function normaliseSettings(raw = {}) {
  const rate = Number(raw.vatRateBp);
  return {
    timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : 'Asia/Jerusalem',
    vatRateBp: Number.isSafeInteger(rate) && rate >= 0 ? rate : DEFAULT_VAT_RATE_BP,
    targetOpenDate: isDate(raw.targetOpenDate) ? raw.targetOpenDate : null,
  };
}

// ---------------------------------------------------------------------------
// Lockout
//
// Brute force is handled on the user row rather than by rate limiting the route,
// following stride2mortgage. A counter in the database survives a restart, a new
// edge region and an attacker changing IP; a counter in memory survives none of
// those, which is to say it does not work.
// ---------------------------------------------------------------------------

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MAX_MINUTES = 60;

export function isLockedOut(user, now = Date.now()) {
  if (!user?.lockedUntil) return false;
  const until = new Date(user.lockedUntil).getTime();
  return Number.isFinite(until) && until > now;
}

/**
 * The user row after one more failed attempt.
 *
 * Doubling from one minute at the fifth failure, capped at an hour. The first
 * four cost nothing, because the overwhelmingly common reason to get a PIN wrong
 * is being a member of staff with cold hands, not being an attacker.
 */
export function registerFailure(user, now = Date.now()) {
  const failedAttempts = (user?.failedAttempts ?? 0) + 1;
  if (failedAttempts < LOCKOUT_THRESHOLD) return { failedAttempts, lockedUntil: null };

  const minutes = Math.min(LOCKOUT_MAX_MINUTES, 2 ** (failedAttempts - LOCKOUT_THRESHOLD));
  return { failedAttempts, lockedUntil: new Date(now + minutes * 60000).toISOString() };
}

export function clearFailures() {
  return { failedAttempts: 0, lockedUntil: null };
}

/**
 * A PIN worth having. Six digits is the floor Stride settled on, and the reason
 * holds here: the lockout above is a floor on guessing speed, not a substitute
 * for a PIN worth guessing at.
 */
export const PIN_MIN_LENGTH = 6;

export function isValidPin(pin) {
  return typeof pin === 'string' && pin.length >= PIN_MIN_LENGTH && /^\d+$/.test(pin);
}

export function isValidUsername(username) {
  return typeof username === 'string' && /^[a-z0-9][a-z0-9_-]{1,29}$/.test(username);
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

/**
 * How far through a task its steps are.
 *
 * `fraction` is 0 when there are no subtasks at all, and the ring renders as an
 * empty track — a task with no steps is not 0% done, it is unmeasured, and the
 * caller can tell the two apart by `total`.
 */
export function subtaskProgress(subtasks = []) {
  const total = subtasks.length;
  const done = subtasks.filter((subtask) => subtask.done).length;
  return { done, total, fraction: total === 0 ? 0 : done / total };
}

export function subtasksOf(itemId, subtasks = []) {
  return subtasks
    .filter((subtask) => subtask.itemId === itemId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.title).localeCompare(String(b.title)));
}

// ---------------------------------------------------------------------------
// Completing a task
// ---------------------------------------------------------------------------

export const CONCLUSION_REQUIRED =
  'Write what actually happened in the conclusion before marking this done.';

/**
 * A task may only be marked done once somebody has written how it ended.
 *
 * This is the one piece of friction in the app that is there on purpose. A
 * finished task with nothing written about how it finished is exactly what this
 * board exists to prevent: three months later nobody remembers which supplier
 * was chosen or what the inspector actually said.
 *
 * `dropped` is deliberately exempt. Abandoning something is not an outcome that
 * needs writing up, and demanding a conclusion for it would just teach people
 * to type a full stop.
 */
export function canComplete(fields) {
  return typeof fields?.conclusion === 'string' && fields.conclusion.trim().length > 0;
}

export function completionProblem(fields) {
  return fields?.status === 'done' && !canComplete(fields) ? CONCLUSION_REQUIRED : null;
}

/**
 * Whether a ticked step is still missing its line about how it went.
 *
 * Used to decide when to ask, not to decide whether the tick is allowed. A
 * task's conclusion is required because a task is a decision worth writing up.
 * A step is often a two-minute errand, and this board has a hundred and
 * thirteen of them — demanding a sentence for every tick would teach people to
 * type a full stop, which is worse than an empty column because it looks like
 * an answer.
 *
 * So the app asks every time and accepts silence. Asking costs nothing when
 * there is nothing to say; not asking loses the one moment the answer is known.
 */
export function wantsConclusion(step) {
  if (!step?.done) return false;
  return typeof step.conclusion !== 'string' || step.conclusion.trim().length === 0;
}

// ---------------------------------------------------------------------------
// The edit lease
//
// Several people use this app at once, so two of them opening the same task is
// a question of when rather than whether. Whoever opens it first holds it; the
// others see it read-only and are told who has it.
//
// It is a lease rather than a lock, and that distinction is the whole design: a
// lock has to be given back, and somebody will always shut a laptop instead.
// A lease simply stops being true.
// ---------------------------------------------------------------------------

/** A minute. Long enough to think, short enough that nobody waits on a ghost. */
export const LOCK_LEASE_MS = 60_000;

export function lockState(item, viewerId, now = Date.now()) {
  const at = item?.lockedAt ? new Date(item.lockedAt).getTime() : null;
  const live = Number.isFinite(at) && now - at < LOCK_LEASE_MS;

  if (!live || !item?.lockedBy) return { locked: false, mine: false, holderId: null };
  return { locked: true, mine: item.lockedBy === viewerId, holderId: item.lockedBy };
}

/** Can this person write to this task right now? */
export function canEdit(item, viewerId, now = Date.now()) {
  const state = lockState(item, viewerId, now);
  return !state.locked || state.mine;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Per-person workload, for the page that divides the board by who is carrying
 * what.
 *
 * Unassigned work is returned alongside rather than hidden, because a task
 * nobody owns is the most likely one to be missed, and a page about who is
 * doing what should say so out loud.
 */
export function summarisePeople(items, users, today) {
  const blank = () => ({ total: 0, done: 0, open: 0, overdue: 0 });
  const byId = new Map(users.map((user) => [user.id, { user, ...blank() }]));
  const unassigned = { user: null, ...blank() };

  for (const item of items) {
    // A task with several owners counts for each of them. The totals therefore
    // do not sum to the number of tasks, and that is correct: this measures
    // what each person is carrying, not how the work is partitioned. Three
    // people on the partnership agreement are all three of them responsible for
    // it, not a third each.
    const owners = (item.owners ?? []).map((id) => byId.get(id)).filter(Boolean);
    const rows = owners.length > 0 ? owners : [unassigned];

    for (const row of rows) {
      row.total += 1;
      if (item.status === 'done') row.done += 1;
      if (isOpen(item)) row.open += 1;
      if (isOverdue(item, today)) row.overdue += 1;
    }
  }

  return {
    people: [...byId.values()].sort((a, b) => b.open - a.open || b.total - a.total),
    unassigned,
  };
}

export function ownedBy(items, userId) {
  return items.filter((item) => (item.owners ?? []).includes(userId));
}

export function unowned(items) {
  return items.filter((item) => (item.owners ?? []).length === 0);
}

/**
 * The overview.
 *
 * Deliberately not a per-person money breakdown: what somebody is spending is
 * not a useful way to think about a launch budget, because the person who
 * happens to own the lease line is not thereby the biggest spender. So money is
 * reported once, for the venue, and people are reported by workload.
 */
export function overviewStats(items, payments, users, settings, today) {
  const budget = summariseBudget(items, payments);

  return {
    hero: heroState(settings, items, today),
    people: summarisePeople(items, users, today),
    work: {
      total: items.length,
      done: items.filter((item) => item.status === 'done').length,
      open: items.filter(isOpen).length,
      overdue: items.filter((item) => isOverdue(item, today)).length,
    },
    money: {
      expected: budget.planned,
      spent: budget.actual,
      // What you still expect to pay out. Never negative: once actual passes
      // planned there is nothing left to *expect*, you are simply over.
      remaining: Math.max(0, budget.planned - budget.actual),
      variance: budget.variance,
    },
  };
}

// ---------------------------------------------------------------------------
// Nested steps
//
// Steps can contain steps, five levels deep. The limit is a real one rather
// than a shrug: past about five the indentation runs out of width on a phone,
// and a task that needs six levels is not a task, it is a project that should
// have been split.
// ---------------------------------------------------------------------------

export const MAX_SUBTASK_DEPTH = 5;

/**
 * Turn the flat rows into a tree, ordered at every level.
 *
 * Orphans — a row whose parent is missing — are lifted to the top rather than
 * dropped. Losing somebody's step because a parent was deleted underneath it is
 * far worse than showing it in the wrong place.
 */
export function buildSubtaskTree(subtasks = [], itemId = null) {
  const rows = itemId === null ? subtasks : subtasks.filter((s) => s.itemId === itemId);
  const byId = new Map(rows.map((row) => [row.id, { ...row, children: [] }]));
  const roots = [];

  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const order = (list) => {
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)
      || String(a.title).localeCompare(String(b.title)));
    for (const node of list) order(node.children);
    return list;
  };

  return order(roots);
}

/** How deep a given row sits, counting from 1. */
export function depthOf(id, subtasks = []) {
  const byId = new Map(subtasks.map((row) => [row.id, row]));
  let depth = 1;
  let current = byId.get(id);

  while (current?.parentId) {
    depth += 1;
    current = byId.get(current.parentId);
    // A cycle should be impossible through the UI, but a runaway loop here
    // would hang the request rather than merely being wrong.
    if (depth > MAX_SUBTASK_DEPTH + 1) break;
  }

  return depth;
}

export function canNestUnder(parentId, subtasks = []) {
  if (!parentId) return true;
  return depthOf(parentId, subtasks) < MAX_SUBTASK_DEPTH;
}

/** How many levels the subtree rooted at `id` occupies. A leaf is 1. */
export function subtreeHeight(id, subtasks = []) {
  const children = new Map();
  for (const row of subtasks) {
    if (!row.parentId) continue;
    if (!children.has(row.parentId)) children.set(row.parentId, []);
    children.get(row.parentId).push(row.id);
  }

  const walk = (node, guard) => {
    if (guard > MAX_SUBTASK_DEPTH + 1) return 1;
    const kids = children.get(node) ?? [];
    let tallest = 0;
    for (const kid of kids) tallest = Math.max(tallest, walk(kid, guard + 1));
    return 1 + tallest;
  };

  return walk(id, 1);
}

/** Whether `id` sits anywhere beneath `ancestorId`. */
export function isDescendantOf(id, ancestorId, subtasks = []) {
  if (!id || !ancestorId) return false;
  const byId = new Map(subtasks.map((row) => [row.id, row]));
  let current = byId.get(id);
  let guard = 0;

  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
    if ((guard += 1) > MAX_SUBTASK_DEPTH + 1) break;
  }

  return false;
}

/**
 * Why a step cannot be moved under a given parent, or null if it can.
 *
 * Four ways a move is wrong, and each of them has to be said in a sentence
 * rather than swallowed: a step cannot be its own parent, cannot be moved
 * inside its own subtree (which would detach that subtree from the tree
 * entirely and lose it), cannot cross to another task, and cannot land
 * somewhere that would push its own deepest step past the limit.
 *
 * That last one is why `subtreeHeight` exists. Dragging a leaf onto a step at
 * level four is fine; dragging a step that already has two levels under it onto
 * the same target is not, and checking only the target's depth would let it
 * through and then silently render a sixth level.
 */
export function moveProblem(id, parentId, subtasks = []) {
  const byId = new Map(subtasks.map((row) => [row.id, row]));
  const moving = byId.get(id);
  if (!moving) return 'That step no longer exists.';

  if (parentId === null || parentId === undefined) {
    return subtreeHeight(id, subtasks) > MAX_SUBTASK_DEPTH ? tooDeep() : null;
  }

  if (parentId === id) return 'A step cannot be put inside itself.';

  const parent = byId.get(parentId);
  if (!parent) return 'That step no longer exists.';
  if (parent.itemId !== moving.itemId) return 'A step cannot move to another task.';

  if (isDescendantOf(parentId, id, subtasks)) {
    return 'A step cannot be put inside one of its own steps.';
  }

  if (depthOf(parentId, subtasks) + subtreeHeight(id, subtasks) > MAX_SUBTASK_DEPTH) {
    return tooDeep();
  }

  return null;
}

/**
 * Which drop a pointer at `y` is asking for, given the rows on screen.
 *
 * `rows` are the candidate steps, already filtered of the dragged step and
 * everything inside it, each with its `top` and `bottom` in the same coordinate
 * space as `y`. Returns null when the pointer is not over any of them.
 *
 * One gesture has to express two different intentions, so the row is split by
 * height: the outer bands mean *between* — put it at this row's own level,
 * before or after it — and the middle band means *inside*. The bands are 30/40/30
 * rather than an even split because the middle one is the one you aim at
 * deliberately, and the edges are the ones you hit on the way past.
 *
 * Lives here rather than in the component because this is the part that can be
 * wrong: the thresholds, and the off-by-one between "before this row" and
 * "after this row". Measuring rectangles is not interesting; deciding what they
 * mean is.
 */
export function dropTarget(rows = [], y) {
  for (const row of rows) {
    const height = row.bottom - row.top;
    if (height <= 0) continue;
    if (y < row.top || y > row.bottom) continue;

    const offset = (y - row.top) / height;
    const parentId = row.parentId ?? null;
    const index = row.index ?? 0;

    if (offset < 0.3) return { kind: 'before', overId: row.id, parentId, index };
    if (offset > 0.7) return { kind: 'after', overId: row.id, parentId, index: index + 1 };
    return { kind: 'inside', overId: row.id, parentId: row.id, index: 0 };
  }

  return null;
}

function tooDeep() {
  return `That would go deeper than ${MAX_SUBTASK_DEPTH} levels. Move fewer steps at once, or split the task.`;
}

/**
 * The rows to write to put `id` under `parentId` at `index` among its siblings.
 *
 * Returns every sibling whose position actually changes, the moved row
 * included, so the caller writes the minimum. Positions are renumbered from
 * zero rather than nudged, because a list that has been dragged around for a
 * month otherwise ends up with positions that no longer describe an order.
 *
 * Pure, and the caller decides what to do with the result: this function does
 * not know that a database exists.
 */
export function placeSubtask(subtasks = [], id, parentId = null, index = 0) {
  const target = parentId ?? null;

  const siblings = subtasks
    .filter((row) => (row.parentId ?? null) === target && row.id !== id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)
      || String(a.title).localeCompare(String(b.title)));

  const at = Math.max(0, Math.min(index, siblings.length));
  const ordered = [...siblings.slice(0, at), { id }, ...siblings.slice(at)];

  const writes = [];
  ordered.forEach((row, position) => {
    if (row.id === id) {
      writes.push({ id, parentId: target, position });
      return;
    }
    if ((row.position ?? 0) !== position) writes.push({ id: row.id, position });
  });

  return writes;
}

// ---------------------------------------------------------------------------
// The shared fund
// ---------------------------------------------------------------------------

/**
 * Who has put in what, what is in the pot, and how it got there.
 *
 * A ledger like the payments one: the balance is the sum of the rows and is
 * never stored. A withdrawal is a negative deposit rather than a deleted row,
 * so the record of what actually moved survives.
 *
 * `series` is cumulative by date for the chart — one point per day on which
 * anything moved, carrying the running balance after that day.
 */
export function summariseFund(deposits = [], users = [], target = 0) {
  const byId = new Map(users.map((user) => [user.id, { user, total: 0, count: 0 }]));
  let balance = 0;

  for (const deposit of deposits) {
    balance += deposit.amount;
    const row = byId.get(deposit.userId);
    if (row) {
      row.total += deposit.amount;
      row.count += 1;
    }
  }

  const byDay = new Map();
  for (const deposit of deposits) {
    byDay.set(deposit.depositedOn, (byDay.get(deposit.depositedOn) ?? 0) + deposit.amount);
  }

  let running = 0;
  const series = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, change]) => {
      running += change;
      return { date, change, balance: running };
    });

  return {
    balance,
    target,
    // Only meaningful with a target set; the page hides progress without one
    // rather than showing a bar filling towards nothing.
    fraction: target > 0 ? Math.min(1, balance / target) : 0,
    remaining: target > 0 ? Math.max(0, target - balance) : 0,
    people: [...byId.values()].sort((a, b) => b.total - a.total),
    series,
  };
}
