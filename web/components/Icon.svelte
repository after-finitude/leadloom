<script lang="ts">
  let { name }: { name: string } = $props();
  const paths: Record<string, string> = {
    inbox: 'M4 4h16v16H4z M4 13h5l2 3h2l2-3h5',
    users:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
    activity: 'M3 12h4l3-8 4 16 3-8h4',
    mail: 'M3 5h18v14H3z M3 5l9 8 9-8',
    arrow: 'M7 17L17 7 M7 7h10v10',
    search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    send: 'M22 2L9 15 M22 2l-7 20-6-7-7-6z',
    spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
    calendar: 'M4 5h16v16H4z M16 3v4 M8 3v4 M4 11h16',
    check: 'M5 12l4 4L19 6',
    clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    pause: 'M8 4v16 M16 4v16',
    play: 'M6 3l14 9-14 9z',
    edit: 'M4 16L16 4l4 4L8 20H4z M14 6l4 4',
    lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
    logout: 'M9 21H3V3h6 M16 17l5-5-5-5 M21 12H9',
    chevron: 'M9 5l7 7-7 7',
    close: 'M6 6l12 12 M6 18L18 6',
    back: 'M19 12H5 M12 5l-7 7 7 7',
    plus: 'M12 5v14 M5 12h14',
    note: 'M5 3h10l4 4v14H5z M15 3v5h4 M8 12h8 M8 16h6',
    refresh: 'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5'
  };
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.65"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name] || paths.spark} /></svg
>
