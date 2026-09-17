import { isDate, parseAgorot } from '@/lib/core.js';
import { createPayment, getSettings } from '@/lib/repo.js';
import { bad, body, currentUserId, handler, ok } from '@/lib/routes.js';

/**
 * Record a payment against an item.
 *
 * The VAT rate is read from settings here and written onto the row, which is the
 * only moment it is ever decided. Changing the rate later decides what the next
 * invoice means and must never rewrite what this one did.
 *
 * A negative amount is a refund and is deliberately allowed: a withdrawn licence
 * application that returns its fee is a negative payment rather than a deleted
 * one, so the record of what actually moved survives.
 */
export const POST = handler(async (request) => {
  const userId = currentUserId(request);
  if (!userId) return bad('Not signed in.', 401);

  const raw = await body(request);
  if (!raw.itemId) return bad('A payment needs an item.');
  if (!isDate(raw.paidOn)) return bad('A payment needs a date, as YYYY-MM-DD.');

  const gross = parseAgorot(raw.gross);
  if (gross === null) return bad('That amount is not a number I can read.');
  if (gross === 0) return bad('A payment of nothing is not worth recording.');

  const settings = await getSettings();

  return ok({
    payment: await createPayment({
      itemId: raw.itemId,
      paidOn: raw.paidOn,
      gross,
      vatRateBp: settings.vatRateBp,
      note: String(raw.note ?? '').trim() || null,
    }, userId),
  });
});
