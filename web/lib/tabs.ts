// Arrow keys move between tabs and focus the new one (WAI-ARIA tabs pattern). Put this on the
// tablist; each tab needs data-tab={key}.
export function tabKeydown<T extends string>(
  event: KeyboardEvent,
  keys: readonly T[],
  current: T,
  select: (key: T) => void
) {
  const step = ['ArrowRight', 'ArrowDown'].includes(event.key)
    ? 1
    : ['ArrowLeft', 'ArrowUp'].includes(event.key)
      ? -1
      : 0;
  if (!step) return;
  event.preventDefault();
  const next = keys[(keys.indexOf(current) + step + keys.length) % keys.length];
  select(next);
  (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
}
