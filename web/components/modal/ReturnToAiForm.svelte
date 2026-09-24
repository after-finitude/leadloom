<script lang="ts">
  import type { Lead } from '../../lib/types.ts';
  import { post } from '../../lib/api.ts';
  import { value } from '../../lib/format.ts';
  import ModalForm from './ModalForm.svelte';
  let { lead }: { lead: Lead } = $props();
  async function save(data: FormData) {
    await post(`/leads/${lead.id}/return-to-ai`, { reason: value(data, 'reason') });
    return 'Conversation control updated';
  }
</script>

<ModalForm title="Resolve review and return to AI" submitLabel="Resolve and return to AI" {save}>
  <div class="attention">{lead.review_reason?.replaceAll('_', ' ')}</div>
  <div class="field">
    <label for="reason">Resolution notes</label><textarea
      id="reason"
      name="reason"
      required
      minlength="3"
      placeholder="Explain how this review was resolved"></textarea>
  </div>
  <p class="small muted">This does not remove a pause or restore opt-out consent.</p>
</ModalForm>
