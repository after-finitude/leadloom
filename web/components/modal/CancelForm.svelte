<script lang="ts">
  import type { Appointment } from '../../lib/types.ts';
  import { post, pendingKey, clearPending } from '../../lib/api.ts';
  import ModalForm from './ModalForm.svelte';
  let { appointment }: { appointment: Appointment } = $props();
  async function save() {
    const scope = `cancel:${appointment.id}`;
    await post(`/appointments/${appointment.id}/cancel`, {
      key: pendingKey(scope, appointment.id)
    });
    clearPending(scope);
    return 'Cancellation request saved';
  }
</script>

<ModalForm
  title="Cancel consultation"
  submitLabel="Confirm cancellation"
  cancelLabel="Keep appointment"
  danger
  {save}
>
  <p class="muted small">
    The existing appointment remains confirmed until the calendar acknowledges cancellation.
    Follow-ups will not restart automatically.
  </p>
</ModalForm>
