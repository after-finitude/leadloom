<script lang="ts">
  import type { Contact } from '../../lib/types.ts';
  import { post } from '../../lib/api.ts';
  import { value } from '../../lib/format.ts';
  import ModalForm from './ModalForm.svelte';
  let { eventId, contacts }: { eventId: string; contacts: Contact[] } = $props();
  async function save(data: FormData) {
    await post(`/intake-events/${eventId}/resolve`, { contactId: value(data, 'contactId') });
    return 'Intake resolution saved';
  }
</script>

<ModalForm title="Resolve contact conflict" submitLabel="Resolve intake" {save}>
  <p class="small muted">
    Select the correct existing contact after checking the original source. Existing trusted email
    and phone details will not be overwritten.
  </p>
  <div class="field">
    <label for="contact">Correct contact</label><select id="contact" name="contactId" required
      >{#each contacts as contact (contact.id)}<option value={contact.id}
          >{contact.name} — {contact.email || contact.phone || ''}</option
        >{/each}</select
    >
  </div>
</ModalForm>
