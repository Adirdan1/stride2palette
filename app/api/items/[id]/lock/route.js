import { claimLock, releaseLock } from '@/lib/repo.js';
import { bad, currentUserId, handler, ok } from '@/lib/routes.js';

/**
 * Claim or refresh the lease on a task.
 *
 * The browser calls this when a task is opened and every few seconds while it
 * stays open. Refreshing through the same endpoint as claiming is deliberate:
 * there is one code path, so a refresh can never succeed where a claim would
 * have failed.
 */
export const POST = handler(async (request, { params }) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const { id } = await params;
  const result = await claimLock(id, userId);

  return result.ok
    ? ok({ held: true, item: result.item })
    : ok({ held: false });
});

/** Let go early. The lease would expire anyway, but waiting a minute for a task
 *  somebody has already closed is a poor experience for everyone else. */
export const DELETE = handler(async (request, { params }) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const { id } = await params;
  await releaseLock(id, userId);
  return ok();
});
