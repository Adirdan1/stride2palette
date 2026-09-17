import { deletePayment } from '@/lib/repo.js';
import { handler, ok } from '@/lib/routes.js';

/** For a payment entered by mistake. A refund is a negative payment, not this. */
export const DELETE = handler(async (_request, { params }) => {
  const { id } = await params;
  await deletePayment(id);
  return ok();
});
