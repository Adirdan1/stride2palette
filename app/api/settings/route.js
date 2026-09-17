import { isDate } from '@/lib/core.js';
import { getSettings, updateSettings } from '@/lib/repo.js';
import { bad, body, handler, ok } from '@/lib/routes.js';

export const GET = handler(async () => ok({ settings: await getSettings() }));

export const PATCH = handler(async (request) => {
  const raw = await body(request);
  const patch = {};

  if ('targetOpenDate' in raw) {
    // Clearing it is a real thing to do: it sends the hero back to counting what
    // is left rather than counting down to a date nobody believes any more.
    if (raw.targetOpenDate && !isDate(raw.targetOpenDate)) {
      return bad('An opening date must be YYYY-MM-DD.');
    }
    patch.targetOpenDate = raw.targetOpenDate || null;
  }

  if ('vatRateBp' in raw) {
    const rate = Number(raw.vatRateBp);
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 10000) {
      return bad('A VAT rate is basis points: 1800 is 18%.');
    }
    patch.vatRateBp = rate;
  }

  if ('timezone' in raw) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: raw.timezone });
    } catch {
      return bad(`${raw.timezone} is not a timezone I recognise.`);
    }
    patch.timezone = raw.timezone;
  }

  if (Object.keys(patch).length === 0) return bad('Nothing to change.');
  return ok({ settings: await updateSettings(patch) });
});
