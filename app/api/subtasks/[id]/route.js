import { deleteSubtask, setSubtaskDone } from '@/lib/repo.js';
import { body, handler, ok } from '@/lib/routes.js';

export const PATCH = handler(async (request, { params }) => {
  const { id } = await params;
  const { done } = await body(request);
  return ok({ subtask: await setSubtaskDone(id, Boolean(done)) });
});

export const DELETE = handler(async (_request, { params }) => {
  const { id } = await params;
  await deleteSubtask(id);
  return ok();
});
