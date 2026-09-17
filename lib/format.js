import { daysBetween, isDate, vatSplit } from './core.js';

/**
 * Presentation. Nothing here decides anything — it only chooses words and
 * punctuation for values core has already worked out.
 */

const SHEKELS = new Intl.NumberFormat('en-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SHEKELS_WHOLE = new Intl.NumberFormat('en-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Agorot -> "₪1,180.50".
 *
 * Whole shekels lose the ".00" by default, because a launch budget is mostly
 * round numbers and a column of trailing zeroes is just noise to scan past.
 * Pass `exact` where the agorot matter, such as on a single invoice.
 */
export function shekels(agorot, { exact = false } = {}) {
  if (!Number.isFinite(agorot)) return '—';
  const whole = agorot % 100 === 0;
  return (whole && !exact ? SHEKELS_WHOLE : SHEKELS).format(agorot / 100);
}

/** Always signed, for a variance where the direction is the whole point. */
export function signedShekels(agorot) {
  if (!Number.isFinite(agorot)) return '—';
  if (agorot === 0) return 'on budget';
  return `${agorot > 0 ? '+' : '−'}${shekels(Math.abs(agorot))}`;
}

export function vatLine(gross, rateBp) {
  const { net, vat } = vatSplit(gross, rateBp);
  return `${shekels(net, { exact: true })} + ${shekels(vat, { exact: true })} VAT`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-17" -> "17 Sep", or "17 Sep 2027" when it is not the current year. */
export function shortDate(date, today) {
  if (!isDate(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  const sameYear = isDate(today) && today.slice(0, 4) === date.slice(0, 4);
  return sameYear ? `${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * How a due date reads next to an item.
 *
 * Relative up to a fortnight either side, because that is the range where "in
 * 3 days" is easier to act on than a date; absolute beyond it, where the actual
 * day is what you need. Overdue is always phrased as elapsed time, never as a
 * negative number.
 */
export function dueLabel(date, today) {
  if (!isDate(date) || !isDate(today)) return '';

  const days = daysBetween(today, date);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1 && days <= 14) return `in ${days} days`;
  if (days < -1 && days >= -14) return `${-days} days ago`;
  return shortDate(date, today);
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Two letters for an avatar chip. "Adir Danan" -> "AD", "adir" -> "AD". */
export function initials(name) {
  if (typeof name !== 'string' || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1
    ? parts[0][0] + parts[parts.length - 1][0]
    : parts[0].slice(0, 2);
  return letters.toUpperCase();
}
