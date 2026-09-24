import { ui, busy, notify, refresh } from './workspace.svelte.ts';
import { errorMessage } from './api.ts';

// A dialog stays open while its request runs, so the result is never lost.
export function closeModal() {
  if (!busy('modal')) ui.modal = null;
}
export async function finishModal(message: string) {
  ui.modal = null;
  ui.changeCount++;
  notify(message);
  await refresh().catch((cause) =>
    notify(`Saved, but the view could not refresh: ${errorMessage(cause)}`, true)
  );
}
