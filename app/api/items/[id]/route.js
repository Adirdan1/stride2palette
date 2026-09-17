import { deleteItem, updateItem } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';
import { parseItemFields } from '../route.js';

export const PATCH = handler(async (request, { params }) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const { id } = await params;
  const patch = parseItemFields(await body(request), { partial: true });
  if (Object.keys(patch).length === 0) return bad('Nothing to change.');

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
