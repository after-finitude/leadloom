<script lang="ts">
  import { untrack } from 'svelte';
  import type { Lead } from '../lib/types.ts';
  import { ui, submit, refresh, selectLead, run } from '../lib/workspace.svelte.ts';
  import { post, pendingKey, clearPending, errorMessage } from '../lib/api.ts';
  import { readDraft, writeDraft } from '../lib/drafts.ts';
  import { initials } from '../lib/format.ts';
  import Icon from './Icon.svelte';
  import Messages from './Messages.svelte';
  let { lead }: { lead: Lead } = $props();
  const draftScope = untrack(() => `staff:${ui.user?.id}:${lead.id}`);
  let body = $state(readDraft(draftScope));
  let draftSaved = $state(true);
  let error = $state('');
  function updateDraft(next: string) {
    body = next;
    draftSaved = writeDraft(draftScope, next);
  }
  async function send(event: SubmitEvent) {
    error = '';
    const sent = await submit(
      event,
      async () => {
        const sent = body,
          scope = `staff:${lead.id}`;
        if (!sent.trim()) throw new Error('Write a message before sending.');
        await post(`/leads/${lead.id}/messages`, {
          body: sent,
          key: pendingKey(scope, sent)
        });
        clearPending(scope);
        if (body === sent) updateDraft('');
      },
      (cause) => {
        error = errorMessage(cause);
      }
    );
    if (sent) await run(refresh);
  }
</script>

<header class="conversation-head">
  <div class="conversation-person">
    <button
      class="icon-btn mobile-back"
      aria-label="Back to list"
      onclick={() => run(() => selectLead(''))}><Icon name="back" /></button
    >
    <div class="avatar">{initials(lead.name)}</div>
    <div class="conversation-identity">
      <h2>{lead.name}</h2>
      <p>
        {lead.fields.service_type || 'New enquiry'} · {lead.opt_out
          ? 'Opted out'
          : lead.paused
            ? 'Paused'
            : lead.owner === 'AI'
              ? 'AI assistant'
              : 'Team member'}
      </p>
    </div>
  </div>
  <button class="btn" popovertarget="conversation-details" aria-label="Lead details"
    >Details <Icon name="users" /></button
  >
</header>
{#if lead.opt_out}<div class="attention red">
    This contact has opted out. Automated and manual outreach are blocked.
  </div>{:else if lead.review_reason}<div class="attention">
    Needs a team member · {lead.review_reason.replaceAll('_', ' ')}
  </div>{/if}
<Messages messages={lead.messages} name={lead.name} />
<form class="composer" onsubmit={send}>
  <textarea
    value={body}
    oninput={(event) => updateDraft(event.currentTarget.value)}
    aria-label="Manager reply"
    aria-describedby={error ? 'reply-error' : undefined}
    aria-invalid={error ? 'true' : undefined}
    placeholder="Write a personal reply…"
    maxlength="4000"
    disabled={!!lead.opt_out}
    required></textarea>
  {#if error}<p id="reply-error" class="form-error" role="alert">{error}</p>{/if}
  {#if body && !draftSaved}<p class="form-error" role="status">
      Browser storage is unavailable. Keep this tab open to retain your draft.
    </p>{/if}
  <div class="composer-footer">
    <span class="composer-hint"><Icon name="lock" /> Replying takes over from AI.</span><button
      class="btn primary"
      type="submit"
      disabled={ui.busy || !!lead.opt_out}>Send reply <Icon name="send" /></button
    >
  </div>
</form>
