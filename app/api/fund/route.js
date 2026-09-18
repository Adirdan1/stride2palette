import { isDate, parseAgorot } from '@/lib/core.js';
import { createDeposit } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';

/**
 * Record money into the shared fund.
 *
 * A negative amount is a withdrawal and is deliberately allowed, for the same
 * reason a payment can be a refund: the pot is a ledger, and editing history
 * away loses the record of what actually moved.
 */
export const POST = handler(async (request) => {
  const actor = currentUserId(request);
  if (!actor) return bad('Not signed in.', 401);

  const raw = await body(request);
  if (!raw.userId) return bad('A deposit needs to be from somebody.');
  if (!isDate(raw.depositedOn)) return bad('A deposit needs a date, as YYYY-MM-DD.');

  const amount = parseAgorot(raw.amount);
  if (amount === null) return bad('That amount is not a number I can read.');
  if (amount === 0) return bad('A deposit of nothing is not worth recording.');

  return ok({
    deposit: await createDeposit({
      userId: raw.userId,
      amount,
      depositedOn: raw.depositedOn,
      note: String(raw.note ?? '').trim() || null,
    }, actor),
  });
});
