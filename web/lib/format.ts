import type { Message } from './types.ts';

export const sameMessageDay = (first: number, second: number) =>
  new Date(first).toDateString() === new Date(second).toDateString();

export function messageDay(timestamp: number, now = Date.now()) {
  if (sameMessageDay(timestamp, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameMessageDay(timestamp, yesterday.getTime())) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(timestamp);
}

export function sameMessageGroup(first: Message | undefined, second: Message | undefined) {
  return (
    !!first &&
    !!second &&
    first.author !== 'system' &&
    first.author === second.author &&
    sameMessageDay(first.created_at, second.created_at) &&
    second.created_at >= first.created_at &&
    second.created_at - first.created_at <= 5 * 60_000
  );
}

export const initials = (name: string) =>
  (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
export const dateTime = (ms: number | null | undefined, short = false, timeZone?: string) =>
  ms
    ? new Intl.DateTimeFormat('en-GB', {
        ...(short
          ? ({ hour: '2-digit', minute: '2-digit' } as const)
          : ({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } as const)),
        timeZone
      }).format(ms)
    : '—';
export const appointmentTime = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(ms);
export const money = (value: number | null | undefined, currency = 'USD') =>
  value == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(value);
export const value = (data: FormData, key: string) => String(data.get(key) || '');
export const list = (text: string, separator = ',') =>
  text
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
