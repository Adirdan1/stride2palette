import { deleteDeposit } from '@/lib/repo.js';
import { handler, ok } from '@/lib/routes.js';

/** For a deposit entered by mistake. A withdrawal is a negative amount, not this. */
export const DELETE = handler(async (_request, { params }) => {
  const { id } = await params;
  await deleteDeposit(id);
  return ok();
});
