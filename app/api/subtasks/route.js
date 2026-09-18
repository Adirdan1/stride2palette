import { createSubtask } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';

export const POST = handler(async (request) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const { itemId, title } = await body(request);
  if (!itemId) return bad('A step needs a task.');

  const trimmed = String(title ?? '').trim();
  if (!trimmed) return bad('A step needs a name.');

  return ok({ subtask: await createSubtask(itemId, trimmed, userId) });
});
