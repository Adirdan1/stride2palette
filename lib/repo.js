import { db, timezone } from './db.js';
import { hashPin, hashSessionToken, SESSION_MAX_AGE } from './auth.js';
import {
  clearFailures,
  groupItems,
  heroState,
  normaliseSettings,
  registerFailure,
  spentOn,
  summariseBudget,
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
  category: row.category,
  status: row.status,
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
  const { data, error } = await db().from('items').select('*');
  fail(error, 'list items');
  return (data ?? []).map(toItem);
}

export async function listPayments() {
  const { data, error } = await db().from('payments').select('*').order('paid_on', { ascending: false });
  fail(error, 'list payments');
  return (data ?? []).map(toPayment);
}

export async function createItem(fields, userId) {
  const { data, error } = await db().from('items').insert({
    title: fields.title,
    category: fields.category,
    status: fields.status,
    due: fields.due || null,
    planned_agorot: fields.planned ?? 0,
    owner_id: fields.ownerId || null,
    note: fields.note || null,
    position: fields.position ?? 0,
    created_by: userId,
    updated_by: userId,
  }).select().single();
  fail(error, 'create item');
  return toItem(data);
}

export async function updateItem(id, patch, userId) {
  const row = { updated_by: userId, updated_at: new Date().toISOString() };
  if ('title' in patch) row.title = patch.title;
  if ('category' in patch) row.category = patch.category;
  if ('status' in patch) row.status = patch.status;
  if ('due' in patch) row.due = patch.due || null;
  if ('planned' in patch) row.planned_agorot = patch.planned;
  if ('ownerId' in patch) row.owner_id = patch.ownerId || null;
  if ('note' in patch) row.note = patch.note || null;
  if ('position' in patch) row.position = patch.position;

  const { data, error } = await db().from('items').update(row).eq('id', id).select().single();
  fail(error, 'update item');
  return toItem(data);
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
 * Everything the one screen needs, in one place.
 *
 * Four reads and then all of the arithmetic in core. The board is small — a
 * launch checklist is tens of rows, not thousands — so there is nothing to gain
 * from pushing the grouping or the totals into SQL, and a great deal to lose:
 * every one of those rules is exhaustively tested precisely because it lives in
 * a pure function rather than in a query.
 */
export async function loadBoard(now = new Date()) {
  const [settings, items, payments, users] = await Promise.all([
    getSettings(), listItems(), listPayments(), listUsers(),
  ]);

  const today = todayIn(settings.timezone || timezone(), now);
  const spend = new Map(items.map((item) => [item.id, spentOn(item.id, payments)]));

  return {
    today,
    settings,
    users,
    payments,
    bands: groupItems(items, today),
    budget: summariseBudget(items, payments),
    hero: heroState(settings, items, today),
    spend,
  };
}
