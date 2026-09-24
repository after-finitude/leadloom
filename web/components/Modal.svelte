<script lang="ts">
  import type { Modal } from '../lib/types.ts';
  import FieldsForm from './modal/FieldsForm.svelte';
  import StageForm from './modal/StageForm.svelte';
  import NoteForm from './modal/NoteForm.svelte';
  import ReturnToAiForm from './modal/ReturnToAiForm.svelte';
  import RestoreConsentForm from './modal/RestoreConsentForm.svelte';
  import CancelForm from './modal/CancelForm.svelte';
  import RescheduleDialog from './modal/RescheduleDialog.svelte';
  import ResolveForm from './modal/ResolveForm.svelte';
  import EmailPreview from './modal/EmailPreview.svelte';
  let { modal }: { modal: Modal } = $props();
</script>

{#if modal.kind === 'fields'}<FieldsForm lead={modal.lead} />
{:else if modal.kind === 'stage'}<StageForm lead={modal.lead} />
{:else if modal.kind === 'note'}<NoteForm lead={modal.lead} />
{:else if modal.kind === 'return-to-ai'}<ReturnToAiForm lead={modal.lead} />
{:else if modal.kind === 'restore-consent'}<RestoreConsentForm lead={modal.lead} />
{:else if modal.kind === 'cancel'}<CancelForm appointment={modal.appointment} />
{:else if modal.kind === 'reschedule'}<RescheduleDialog
    appointment={modal.appointment}
    slots={modal.slots || []}
    timezone={modal.timezone}
  />
{:else if modal.kind === 'resolve'}<ResolveForm eventId={modal.eventId} contacts={modal.contacts} />
{:else if modal.kind === 'email'}<EmailPreview email={modal.email} />{/if}
