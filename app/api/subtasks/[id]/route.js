import { deleteSubtask, moveSubtask, setSubtaskConclusion, setSubtaskDone } from '@/lib/repo.js';
import { body, handler, ok } from '@/lib/routes.js';

/**
 * Three writes share this route because they share a subject, but they are
 * different things: `done` is one boolean anybody may set, `conclusion` is the
 * line about how that step went, and a move rearranges the tree and is checked
 * against the task's current rows before anything is written.
 */
export const PATCH = handler(async (request, { params }) => {
  const { id } = await params;
  const payload = await body(request);

  if ('parentId' in payload || 'index' in payload) {
    const index = Number(payload.index);
    await moveSubtask(
      id,
      payload.parentId ?? null,
      Number.isSafeInteger(index) && index >= 0 ? index : 0,
    );
    return ok();
  }

  if ('conclusion' in payload) {
    return ok({ subtask: await setSubtaskConclusion(id, payload.conclusion) });
  }

  return ok({ subtask: await setSubtaskDone(id, Boolean(payload.done)) });
});

export const DELETE = handler(async (_request, { params }) => {
  const { id } = await params;
  await deleteSubtask(id);
  return ok();
});
