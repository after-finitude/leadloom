<script lang="ts">
  import type { Lead } from '../../lib/types.ts';
  import { post } from '../../lib/api.ts';
  import { value } from '../../lib/format.ts';
  import ModalForm from './ModalForm.svelte';
  let { lead }: { lead: Lead } = $props();
  async function save(data: FormData) {
    await post(`/leads/${lead.id}/notes`, { body: value(data, 'body') });
    return 'Private note saved';
  }
</script>

<ModalForm title="Add a private team note" submitLabel="Save note" {save}>
  <div class="field">
    <label for="note">Note</label><textarea id="note" name="body" required maxlength="4000"
    ></textarea>
  </div>
</ModalForm>
