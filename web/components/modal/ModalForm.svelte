<script lang="ts">
  import type { Snippet } from 'svelte';
  import { submit, busy } from '../../lib/workspace.svelte.ts';
  import { errorMessage } from '../../lib/api.ts';
  import { closeModal, finishModal } from '../../lib/modal.ts';
  import ModalShell from './ModalShell.svelte';
  let {
    title,
    submitLabel,
    cancelLabel = 'Cancel',
    danger = false,
    save,
    onError,
    children
  }: {
    title: string;
    submitLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    // Sends the form and returns the confirmation to show.
    save: (data: FormData) => Promise<string>;
    // Returns true when the error is already shown next to a field.
    onError?: (cause: unknown) => boolean;
    children: Snippet;
  } = $props();
  let error = $state('');
  async function onsubmit(event: SubmitEvent) {
    error = '';
    await submit(
      event,
      'modal',
      async (data) => finishModal(await save(data)),
      (cause) => {
        if (!onError?.(cause)) error = errorMessage(cause);
      }
    );
  }
</script>

<ModalShell {title} {error}>
  <form {onsubmit}>
    {@render children()}
    <div class="form-footer">
      <button class="btn" type="button" disabled={busy('modal')} onclick={closeModal}
        >{cancelLabel}</button
      ><button class="btn primary" class:danger disabled={busy('modal')}>{submitLabel}</button>
    </div>
  </form>
</ModalShell>
