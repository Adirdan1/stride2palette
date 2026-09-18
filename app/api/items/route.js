import { completionProblem, isDate, isStatus, parseAgorot } from '@/lib/core.js';
import { createItem } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';

export function parseItemFields(raw, { partial = false } = {}) {
  const fields = {};

  if ('title' in raw || !partial) {
    const title = String(raw.title ?? '').trim();
    if (!title) throw new Error('An item needs a title.');
    fields.title = title;
  }

  if ('status' in raw || !partial) {
    const status = raw.status ?? 'todo';
    if (!isStatus(status)) throw new Error(`${status} is not a status.`);
    fields.status = status;
  }

  if ('domains' in raw) {
    if (!Array.isArray(raw.domains)) throw new Error('Domains must be a list.');
    fields.domains = [...new Set(raw.domains.map(String))];
  }

  if ('description' in raw) fields.description = String(raw.description ?? '').trim() || null;
  if ('conclusion' in raw) fields.conclusion = String(raw.conclusion ?? '').trim() || null;

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

  if ('owners' in raw) {
    if (!Array.isArray(raw.owners)) throw new Error('Owners must be a list.');
    fields.owners = [...new Set(raw.owners.map(String))].filter(Boolean);
  }
  if ('note' in raw) fields.note = String(raw.note ?? '').trim() || null;
  if ('position' in raw) fields.position = Number(raw.position) || 0;

  return fields;
}

/**
 * A task cannot be marked done without a conclusion.
 *
 * Checked against the *merged* result of the change rather than the patch, so
 * setting the status alone on a task that already has a conclusion is fine,
 * and clearing the conclusion on a task that is already done is not.
 */
export function guardCompletion(fields, existing = {}) {
  return completionProblem({
    status: 'status' in fields ? fields.status : existing.status,
    conclusion: 'conclusion' in fields ? fields.conclusion : existing.conclusion,
  });
}

export const POST = handler(async (request) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const fields = parseItemFields(await body(request));
  const problem = guardCompletion(fields);
  if (problem) return bad(problem);

  return ok({ item: await createItem({ ...fields, planned: fields.planned ?? 0 }, userId) });
});
