import { MAX_SUBTASK_DEPTH, canNestUnder } from '@/lib/core.js';
import { createSubtask, listSubtasks } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';

export const POST = handler(async (request) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const { itemId, title, parentId } = await body(request);
  if (!itemId) return bad('A step needs a task.');

  const trimmed = String(title ?? '').trim();
  if (!trimmed) return bad('A step needs a name.');

  // Checked server-side, because the depth limit is a real rule and not a
  // rendering convenience — and a stale tab would otherwise smuggle a sixth
  // level past a browser that thinks the tree is shallower than it is.
  if (parentId && !canNestUnder(parentId, await listSubtasks())) {
    return bad(`Steps only go ${MAX_SUBTASK_DEPTH} levels deep. Split this into its own task instead.`);
  }

  return ok({ subtask: await createSubtask(itemId, trimmed, userId, parentId ?? null) });
});
