<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { busy } from '../../lib/workspace.svelte.ts';
  import { closeModal } from '../../lib/modal.ts';
  import Icon from '../Icon.svelte';
  let {
    title,
    wide = false,
    error = '',
    children
  }: { title: string; wide?: boolean; error?: string; children: Snippet } = $props();
  let dialog: HTMLDialogElement;
  onMount(() => {
    dialog.showModal();
  });
</script>

<dialog
  bind:this={dialog}
  class="modal"
  class:wide
  aria-labelledby="modal-title"
  oncancel={(event) => {
    event.preventDefault();
    closeModal();
  }}
  onclose={closeModal}
>
  <div class="modal-head">
    <h2 id="modal-title">{title}</h2>
    <button
      class="icon-btn"
      type="button"
      aria-label="Close dialog"
      disabled={busy('modal')}
      onclick={closeModal}><Icon name="close" /></button
    >
  </div>
  <div class="modal-body">
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    {@render children()}
  </div>
</dialog>
