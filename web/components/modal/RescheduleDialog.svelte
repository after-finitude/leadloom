<script lang="ts">
  import type { Appointment, Slot } from '../../lib/types.ts';
  import { post, pendingKey, clearPending, errorMessage } from '../../lib/api.ts';
  import { run, busy } from '../../lib/workspace.svelte.ts';
  import { finishModal } from '../../lib/modal.ts';
  import ModalShell from './ModalShell.svelte';
  let {
    appointment,
    slots,
    timezone
  }: { appointment: Appointment; slots: Slot[]; timezone?: string } = $props();
  let error = $state('');
  async function reschedule(offerId: string) {
    error = '';
    await run(
      'modal',
      async () => {
        const scope = `reschedule:${appointment.id}`;
        await post(`/appointments/${appointment.id}/reschedule`, {
          offerId,
          key: pendingKey(scope, offerId)
        });
        clearPending(scope);
        await finishModal('Reschedule request saved; awaiting calendar confirmation');
      },
      (cause) => {
        error = errorMessage(cause);
      }
    );
  }
</script>

<ModalShell title="Choose a new consultation time" {error}>
  <p class="small muted">
    {timezone} · The current booking stays active until this change is confirmed.
  </p>
  <div class="slot-grid">
    {#each slots as slot (slot.id)}<button
        class="slot-button"
        disabled={busy('modal')}
        onclick={() => reschedule(slot.id)}>{slot.label}</button
      >{:else}<p>No free times in the current search window.</p>{/each}
  </div>
</ModalShell>
