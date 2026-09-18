import { canEdit } from '@/lib/core.js';
import { deleteItem, listItems, updateItem } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';
import { guardCompletion, parseItemFields } from '../route.js';

export const PATCH = handler(async (request, { params }) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const { id } = await params;
  const existing = (await listItems()).find((item) => item.id === id);
  if (!existing) return bad('That task no longer exists.', 404);

  // The lease is enforced here, not only in the browser. A read-only form is a
  // courtesy; this is the part that actually stops two people overwriting each
  // other, including on a stale tab that never saw the lock appear.
  if (!canEdit(existing, userId)) {
    return bad('Somebody else is editing this right now.', 409);
  }

  const patch = parseItemFields(await body(request), { partial: true });
  if (Object.keys(patch).length === 0) return bad('Nothing to change.');

  const problem = guardCompletion(patch, existing);
  if (problem) return bad(problem);

  return ok({ item: await updateItem(id, patch, userId) });
});

/**
 * Deletion is for things entered by mistake. Removing something that was real is
 * the `dropped` status, which keeps its payments and its history — and repo.js
 * enforces that, because the foreign key refuses to take a financial record down
 * with an item.
 */
export const DELETE = handler(async (request, { params }) => {
  const { id } = await params;
  await deleteItem(id);
  return ok();
});
