/**
 * Shared Navstar date/time handling.
 * All displayed timestamps use East Africa Time (Africa/Nairobi, UTC+03:00).
 * Safaricom sends transaction dates as YYYYMMDDHHmmss; SQLite CURRENT_TIMESTAMP
 * values are UTC strings without a timezone suffix.
 */
export type DateInput = string | number | Date | null | undefined;

export function parseNavstarDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    const timestamp = value < 100000000000 ? value * 1000 : value;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const input = String(value).trim();
  if (!input) return null;

  // Safaricom Daraja TransactionDate: YYYYMMDDHHmmss, expressed in EAT.
  if (/^\d{14}$/.test(input)) {
    const year = Number(input.slice(0, 4));
    const month = Number(input.slice(4, 6));
    const day = Number(input.slice(6, 8));
    const hour = Number(input.slice(8, 10));
    const minute = Number(input.slice(10, 12));
    const second = Number(input.slice(12, 14));
    const valid = month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59 && second <= 59;
    if (!valid) return null;
    const date = new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  // Date-only values remain the same calendar day in Nairobi.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const date = new Date(input + 'T00:00:00+03:00');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // SQLite CURRENT_TIMESTAMP is UTC but has no explicit "Z".
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input)) {
    const date = new Date(input.replace(' ', 'T') + 'Z');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Treat timezone-less ISO datetimes as UTC for consistent server storage.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(input) ? input + 'Z' : input;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatEATDateTime(value: DateInput): string {
  const date = parseNavstarDate(value);
  return date ? new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short', hour12: true,
  }).format(date) + ' EAT' : 'Not available';
}

export function formatEATDate(value: DateInput): string {
  const date = parseNavstarDate(value);
  return date ? new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi', dateStyle: 'medium',
  }).format(date) : 'Not available';
}

export function eatDateTimeLocalToIso(value: string): string {
  if (!value) return '';
  const date = new Date(value + (value.length === 16 ? ':00' : '') + '+03:00');
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
