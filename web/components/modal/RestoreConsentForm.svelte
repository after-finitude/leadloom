<script lang="ts">
  import type { Lead } from '../../lib/types.ts';
  import { post } from '../../lib/api.ts';
  import { value } from '../../lib/format.ts';
  import ModalForm from './ModalForm.svelte';
  let { lead }: { lead: Lead } = $props();
  async function save(data: FormData) {
    await post(`/leads/${lead.id}/restore-consent`, {
      reason: value(data, 'reason'),
      confirmed: data.has('confirmed')
    });
    return 'Conversation control updated';
  }
</script>

<ModalForm title="Restore automation consent" submitLabel="Record renewed consent" {save}>
  <p class="small muted">
    Record the contact’s new explicit consent. This does not automatically return ownership to AI or
    restart old follow-ups.
  </p>
  <div class="field">
    <label for="reason">Evidence / reason</label><textarea id="reason" name="reason" required
    ></textarea>
  </div>
  <label class="check-row"
    ><input type="checkbox" name="confirmed" required />I have verified renewed consent.</label
  >
</ModalForm>
