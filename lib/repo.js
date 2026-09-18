import { db, timezone } from './db.js';
import { hashPin, hashSessionToken, SESSION_MAX_AGE } from './auth.js';
import {
  LOCK_LEASE_MS,
  clearFailures,
  normaliseSettings,
  registerFailure,
  spentOn,
  todayIn,
} from './core.js';

/**
 * Data access, and the only place that knows what the columns are actually
 * called.
 *
 * The database speaks snake_case and spells out its units — `planned_agorot`,
 * `gross_agorot`, `vat_rate_bp` — because a column called `planned` tells the
 * next person nothing about whether it holds shekels or agorot. core.js speaks
 * its own shorter vocabulary and stays free of the schema. The translation lives
 * here at the boundary rather than bending either side.
 */

const toSettings = (row) => normaliseSettings({
  timezone: row?.timezone,
  vatRateBp: row?.vat_rate_bp,
  targetOpenDate: row?.target_open_date,
});

const toUser = (row) => row && {
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  failedAttempts: row.failed_attempts,
  lockedUntil: row.locked_until,
  createdAt: row.created_at,
};

const toItem = (row) => ({
  id: row.id,
  title: row.title,
  status: row.status,
  description: row.description,
  conclusion: row.conclusion,
  lastEditor: row.last_editor,
  lockedBy: row.locked_by,
  lockedAt: row.locked_at,
  // Flattened from the join table, because core should reason about a task's
  // domains as a list on the task and never about a second table.
  domains: (row.item_domains ?? []).map((link) => link.domain),
  due: row.due,
  planned: row.planned_agorot ?? 0,
  ownerId: row.owner_id,
  note: row.note,
  position: row.position ?? 0,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSubtask = (row) => ({
  id: row.id,
  itemId: row.item_id,
  title: row.title,
  done: row.done,
  position: row.position ?? 0,
  createdBy: row.created_by,
});

const toPayment = (row) => ({
  id: row.id,
  itemId: row.item_id,
  paidOn: row.paid_on,
  gross: row.gross_agorot,
  vatRateBp: row.vat_rate_bp,
  note: row.note,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

function fail(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings() {
  const { data, error } = await db().from('settings').select('*').eq('id', 1).maybeSingle();
  fail(error, 'read settings');
  return toSettings(data);
}

export async function updateSettings(patch) {
  const row = { id: 1, updated_at: new Date().toISOString() };
  if ('timezone' in patch) row.timezone = patch.timezone;
  if ('vatRateBp' in patch) row.vat_rate_bp = patch.vatRateBp;
  // Explicitly nullable: clearing the opening date is a real thing to do, and
  // sends the hero back to counting what is left rather than counting down.
  if ('targetOpenDate' in patch) row.target_open_date = patch.targetOpenDate || null;

  const { data, error } = await db().from('settings').upsert(row).select().single();
  fail(error, 'update settings');
  return toSettings(data);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function countUsers() {
  const { count, error } = await db().from('users').select('id', { count: 'exact', head: true });
  fail(error, 'count users');
  return count ?? 0;
}

export async function listUsers() {
  const { data, error } = await db().from('users').select('*').order('display_name');
  fail(error, 'list users');
  return (data ?? []).map(toUser);
}

export async function getUser(id) {
  if (!id) return null;
  const { data, error } = await db().from('users').select('*').eq('id', id).maybeSingle();
  fail(error, 'read user');
  return toUser(data);
}

/**
 * Returns the row *including* `pin_hash`, which nothing else does.
 *
 * Only the sign-in path calls this. Everything else uses `getUser`, so a hash
 * cannot end up in a response by accident — the shape simply never has one.
 */
export async function findUserForSignIn(username) {
  const { data, error } = await db().from('users').select('*').eq('username', username).maybeSingle();
  fail(error, 'find user');
  return data && { ...toUser(data), pinHash: data.pin_hash };
}

export async function createUser({ username, displayName, pin }) {
  const { data, error } = await db()
    .from('users')
    .insert({ username, display_name: displayName, pin_hash: await hashPin(pin) })
    .select()
    .single();
  fail(error, 'create user');
  return toUser(data);
}

export async function recordSignInFailure(user, now = Date.now()) {
  const next = registerFailure(user, now);
  const { error } = await db()
    .from('users')
    .update({ failed_attempts: next.failedAttempts, locked_until: next.lockedUntil, updated_at: new Date(now).toISOString() })
    .eq('id', user.id);
  fail(error, 'record failed sign-in');
  return next;
}

export async function recordSignInSuccess(userId, now = Date.now()) {
  const next = clearFailures();
  const { error } = await db()
    .from('users')
    .update({ failed_attempts: next.failedAttempts, locked_until: next.lockedUntil, updated_at: new Date(now).toISOString() })
    .eq('id', userId);
  fail(error, 'clear failed sign-ins');
}

// ---------------------------------------------------------------------------
// Sessions
//
// The cookie is what authenticates; these rows exist so a session can be revoked
// before it expires and so you can see who was last in. Nothing on the request
// path reads them.
// ---------------------------------------------------------------------------

export async function openSession(userId, token, now = Date.now()) {
  const { error } = await db().from('sessions').insert({
    token_hash: await hashSessionToken(token),
    user_id: userId,
    expires_at: new Date(now + SESSION_MAX_AGE * 1000).toISOString(),
  });
  fail(error, 'open session');
}

export async function closeSession(token) {
  const { error } = await db().from('sessions').delete().eq('token_hash', await hashSessionToken(token));
  fail(error, 'close session');
}

/** Housekeeping, safe to call whenever. Expired rows authenticate nothing — the
 *  cookie has its own lifetime — they are just clutter. */
export async function purgeExpiredSessions(now = Date.now()) {
  const { error } = await db().from('sessions').delete().lt('expires_at', new Date(now).toISOString());
  fail(error, 'purge sessions');
}

// ---------------------------------------------------------------------------
// Items and payments
// ---------------------------------------------------------------------------

export async function listItems() {
  const { data, error } = await db().from('items').select('*, item_domains(domain)');
  fail(error, 'list items');
  return (data ?? []).map(toItem);
}

export async function listDomains() {
  const { data, error } = await db().from('domains').select('*').order('position');
  fail(error, 'list domains');
  return (data ?? []).map((row) => ({ key: row.key, label: row.label, position: row.position }));
}

export async function listSubtasks() {
  const { data, error } = await db().from('subtasks').select('*').order('position');
  fail(error, 'list subtasks');
  return (data ?? []).map(toSubtask);
}

export async function listPayments() {
  const { data, error } = await db().from('payments').select('*').order('paid_on', { ascending: false });
  fail(error, 'list payments');
  return (data ?? []).map(toPayment);
}

export async function createItem(fields, userId) {
  const { data, error } = await db().from('items').insert({
    title: fields.title,
    status: fields.status,
    description: fields.description || null,
    conclusion: fields.conclusion || null,
    last_editor: userId,
    due: fields.due || null,
    planned_agorot: fields.planned ?? 0,
    owner_id: fields.ownerId || null,
    note: fields.note || null,
    position: fields.position ?? 0,
    created_by: userId,
    updated_by: userId,
  }).select().single();
  fail(error, 'create item');
  if (fields.domains) await setItemDomains(data.id, fields.domains);
  return { ...toItem(data), domains: fields.domains ?? [] };
}

/**
 * Replace a task's domains wholesale.
 *
 * Delete-then-insert rather than a diff: the set is at most six rows, the whole
 * thing arrives from one group of chips, and a diff would be more code with
 * more ways to leave a stale row behind.
 */
export async function setItemDomains(itemId, domains) {
  const client = db();
  const { error: cleared } = await client.from('item_domains').delete().eq('item_id', itemId);
  fail(cleared, 'clear domains');

  const wanted = [...new Set(domains)].filter(Boolean);
  if (wanted.length === 0) return;

  const { error } = await client
    .from('item_domains')
    .insert(wanted.map((domain) => ({ item_id: itemId, domain })));
  fail(error, 'set domains');
}

export async function updateItem(id, patch, userId) {
  const row = {
    updated_by: userId,
    // Distinct from updated_by so it survives independently of any lease, and
    // so the UI can always name whose change you are looking at.
    last_editor: userId,
    updated_at: new Date().toISOString(),
  };
  if ('title' in patch) row.title = patch.title;
  if ('status' in patch) row.status = patch.status;
  if ('description' in patch) row.description = patch.description || null;
  if ('conclusion' in patch) row.conclusion = patch.conclusion || null;
  if ('due' in patch) row.due = patch.due || null;
  if ('planned' in patch) row.planned_agorot = patch.planned;
  if ('ownerId' in patch) row.owner_id = patch.ownerId || null;
  if ('note' in patch) row.note = patch.note || null;
  if ('position' in patch) row.position = patch.position;

  const { data, error } = await db()
    .from('items').update(row).eq('id', id).select('*, item_domains(domain)').single();
  fail(error, 'update item');

  if (patch.domains) {
    await setItemDomains(id, patch.domains);
    return { ...toItem(data), domains: patch.domains };
  }
  return toItem(data);
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export async function createSubtask(itemId, title, userId) {
  const { data, error } = await db().from('subtasks')
    .insert({ item_id: itemId, title, created_by: userId })
    .select().single();
  fail(error, 'add step');
  return toSubtask(data);
}

export async function setSubtaskDone(id, done) {
  const { data, error } = await db().from('subtasks')
    .update({ done }).eq('id', id).select().single();
  fail(error, 'tick step');
  return toSubtask(data);
}

export async function deleteSubtask(id) {
  const { error } = await db().from('subtasks').delete().eq('id', id);
  fail(error, 'remove step');
}

// ---------------------------------------------------------------------------
// The edit lease
// ---------------------------------------------------------------------------

/**
 * Claim or refresh the lease on a task.
 *
 * The `or` filter is what makes this safe without a transaction: the update
 * only lands if the row is unheld, held by an expired lease, or already held by
 * this same person. Two people racing therefore produce exactly one winner,
 * decided by Postgres rather than by whoever's request arrived first.
 */
export async function claimLock(id, userId, now = Date.now()) {
  const stale = new Date(now - LOCK_LEASE_MS).toISOString();

  const { data, error } = await db().from('items')
    .update({ locked_by: userId, locked_at: new Date(now).toISOString() })
    .eq('id', id)
    .or(`locked_by.is.null,locked_by.eq.${userId},locked_at.lt.${stale}`)
    .select('*, item_domains(domain)')
    .maybeSingle();

  fail(error, 'claim the task');
  // No row means somebody else holds a live lease.
  return data ? { ok: true, item: toItem(data) } : { ok: false };
}

export async function releaseLock(id, userId) {
  const { error } = await db().from('items')
    .update({ locked_by: null, locked_at: null })
    .eq('id', id)
    .eq('locked_by', userId);
  fail(error, 'release the task');
}

/**
 * Deletion is for things entered by mistake. `dropped` is how you remove
 * something that was real — it keeps the payments and the history.
 *
 * The foreign key is `on delete restrict`, so this throws rather than quietly
 * taking an item's financial record with it. That error is the safeguard
 * working, and the message says so.
 */
export async function deleteItem(id) {
  const { error } = await db().from('items').delete().eq('id', id);
  if (error) {
    throw new Error(
      'This has payments recorded against it, so it cannot be deleted. '
      + 'Set it to dropped instead, which keeps the money history, or remove the payments first.',
    );
  }
}

export async function createPayment(fields, userId) {
  const { data, error } = await db().from('payments').insert({
    item_id: fields.itemId,
    paid_on: fields.paidOn,
    gross_agorot: fields.gross,
    // Frozen at write time from whatever the rate is now. Never read back from
    // settings afterwards.
    vat_rate_bp: fields.vatRateBp,
    note: fields.note || null,
    created_by: userId,
  }).select().single();
  fail(error, 'record payment');
  return toPayment(data);
}

export async function deletePayment(id) {
  const { error } = await db().from('payments').delete().eq('id', id);
  fail(error, 'delete payment');
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * Everything every page needs, in one read.
 *
 * Six queries and then all of the arithmetic in core. The board is small — a
 * launch checklist is tens of rows, not thousands — so there is nothing to gain
 * from pushing grouping or totals into SQL, and a great deal to lose: every one
 * of those rules is exhaustively tested precisely because it lives in a pure
 * function rather than in a query.
 *
 * One shape serves the overview, the people page and all six domain pages, so
 * the three can never disagree about what the board currently says.
 */
export async function loadEverything(now = new Date()) {
  const [settings, items, payments, users, domains, subtasks] = await Promise.all([
    getSettings(), listItems(), listPayments(), listUsers(), listDomains(), listSubtasks(),
  ]);

  const today = todayIn(settings.timezone || timezone(), now);
  const spend = new Map(items.map((item) => [item.id, spentOn(item.id, payments)]));

  return { today, settings, users, domains, items, subtasks, payments, spend };
}
