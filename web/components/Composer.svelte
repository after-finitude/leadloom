<script lang="ts">
  import { untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { submit, busy } from '../lib/workspace.svelte.ts';
  import { errorMessage } from '../lib/api.ts';
  import { readDraft, writeDraft } from '../lib/drafts.ts';
  import Icon from './Icon.svelte';
  let {
    draft,
    lock,
    label,
    placeholder,
    submitLabel,
    disabled = false,
    send,
    sent,
    hint
  }: {
    // Draft storage scope; the parent re-creates the composer when it changes.
    draft: string;
    lock: string;
    label: string;
    placeholder: string;
    submitLabel: string;
    disabled?: boolean;
    send: (body: string) => Promise<void>;
    sent?: () => Promise<void>;
    hint: Snippet;
  } = $props();
  let body = $state(untrack(() => readDraft(draft)));
  let draftSaved = $state(true);
  let error = $state('');
  function update(next: string) {
    body = next;
    draftSaved = writeDraft(draft, next);
  }
  async function onsubmit(event: SubmitEvent) {
    error = '';
    const ok = await submit(
      event,
      lock,
      async () => {
        const text = body;
        if (!text.trim()) throw new Error('Write a message before sending.');
        await send(text);
        if (body === text) update('');
      },
      (cause) => {
        error = errorMessage(cause);
      }
    );
    if (ok && sent) await sent();
  }
</script>

<form class="composer" {onsubmit}>
  <textarea
    value={body}
    oninput={(event) => update(event.currentTarget.value)}
    aria-label={label}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? 'composer-error' : undefined}
    {placeholder}
    maxlength="4000"
    {disabled}
    required></textarea>
  {#if error}<p id="composer-error" class="form-error" role="alert">{error}</p>{/if}
  {#if body && !draftSaved}<p class="form-error" role="status">
      Browser storage is unavailable. Keep this tab open to retain your draft.
    </p>{/if}
  <div class="composer-footer">
    <span class="composer-hint">{@render hint()}</span><button
      class="btn primary"
      type="submit"
      disabled={busy(lock) || disabled}>{submitLabel} <Icon name="send" /></button
    >
  </div>
</form>
