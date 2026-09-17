import { isCategory, isDate, isStatus, parseAgorot } from '@/lib/core.js';
import { createItem } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';

export function parseItemFields(raw, { partial = false } = {}) {
  const fields = {};

  if ('title' in raw || !partial) {
    const title = String(raw.title ?? '').trim();
    if (!title) throw new Error('An item needs a title.');
    fields.title = title;
  }

  if ('category' in raw || !partial) {
    const category = raw.category ?? 'other';
    if (!isCategory(category)) throw new Error(`${category} is not a category.`);
    fields.category = category;
  }

  if ('status' in raw || !partial) {
    const status = raw.status ?? 'todo';
    if (!isStatus(status)) throw new Error(`${status} is not a status.`);
    fields.status = status;
  }

  if ('due' in raw) {
    // Undated is a real state here, so an empty string clears the date rather
    // than failing validation.
    if (raw.due && !isDate(raw.due)) throw new Error('A due date must be YYYY-MM-DD.');
    fields.due = raw.due || null;
  }

  if ('planned' in raw) {
    const planned = raw.planned === '' || raw.planned == null ? 0 : parseAgorot(raw.planned);
    // parseAgorot returns null rather than 0 for anything unreadable, precisely
    // so this can refuse it instead of silently budgeting nothing.
    if (planned === null) throw new Error('That planned cost is not a number I can read.');
    fields.planned = planned;
  }

  if ('ownerId' in raw) fields.ownerId = raw.ownerId || null;
  if ('note' in raw) fields.note = String(raw.note ?? '').trim() || null;
  if ('position' in raw) fields.position = Number(raw.position) || 0;

  return fields;
}

export const POST = handler(async (request) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);
  return ok({ item: await createItem(parseItemFields(await body(request)), userId) });
});
