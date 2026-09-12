const formatters = new Map();
export function localParts(ms, timezone) {
  if (!formatters.has(timezone))
    formatters.set(
      timezone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
    );
  const parts = Object.fromEntries(
    formatters
      .get(timezone)
      .formatToParts(new Date(ms))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    minute: Number(parts.hour) * 60 + Number(parts.minute)
  };
}
export function working(ms, settings, duration = 0) {
  const p = localParts(ms, settings.timezone);
  const end = localParts(ms + Math.max(0, duration - 1), settings.timezone);
  const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return (
    settings.hours.days.includes(p.weekday) &&
    p.minute >= minutes(settings.hours.start) &&
    p.minute < minutes(settings.hours.end) &&
    p.date === end.date &&
    end.minute < minutes(settings.hours.end)
  );
}
export function nextWorking(ms, settings) {
  if (working(ms, settings)) return ms;
  let next = Math.ceil(ms / 60000) * 60000;
  for (let i = 0; i < 9 * 1440; i++, next += 60000) if (working(next, settings)) return next;
  throw new Error('No working interval in the next nine days');
}
export function overlaps(a, b, buffer = 0) {
  return a.start < b.end + buffer && a.end + buffer > b.start;
}
export function availableSlots(now, settings, busy, max = 5) {
  const duration = settings.duration * 60000,
    buffer = settings.buffer * 60000,
    step = 15 * 60000;
  const first = Math.ceil((now + settings.minimumNotice * 60000) / step) * step,
    limit = now + settings.horizon * 86400000;
  const slots = [];
  for (let start = first; start < limit && slots.length < max; start += step) {
    const candidate = { start, end: start + duration };
    if (
      working(start, settings, duration) &&
      !busy.some((b) => overlaps(candidate, b, Math.max(buffer, b.buffer || 0)))
    )
      slots.push(candidate);
  }
  return slots;
}
export function timeLabel(start, timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset'
  }).format(new Date(start));
}
