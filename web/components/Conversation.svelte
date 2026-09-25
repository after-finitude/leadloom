<script lang="ts">
  import type { Lead } from '../lib/types.ts';
  import { ui, refresh, selectLead, report } from '../lib/workspace.svelte.ts';
  import { post, pendingKey, clearPending } from '../lib/api.ts';
  import { initials } from '../lib/format.ts';
  import Icon from './Icon.svelte';
  import Messages from './Messages.svelte';
  import Composer from './Composer.svelte';
  import OwnerLabel from './OwnerLabel.svelte';
  let { lead }: { lead: Lead } = $props();
  async function send(body: string) {
    const scope = `staff:${lead.id}`;
    await post(`/leads/${lead.id}/messages`, { body, key: pendingKey(scope, body) });
    clearPending(scope);
  }
</script>

<header class="conversation-head">
  <div class="conversation-person">
    <button
      class="icon-btn mobile-back"
      aria-label="Back to list"
      onclick={() => selectLead('').catch(report)}><Icon name="back" /></button
    >
    <div class="avatar">{initials(lead.name)}</div>
    <div class="conversation-identity">
      <h2>{lead.name}</h2>
      <p>{lead.fields.service_type || 'New enquiry'} · <OwnerLabel {lead} /></p>
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
  </div>{/if}{#if lead.open_question && !lead.opt_out}<div
    class="attention question"
    title={lead.open_question}
  >
    Question for the team · {lead.open_question}
  </div>{/if}
<Messages messages={lead.messages} name={lead.name} />
<Composer
  draft={`staff:${ui.user?.id}:${lead.id}`}
  lock={`lead:${lead.id}`}
  label="Manager reply"
  placeholder="Write a personal reply…"
  submitLabel="Send reply"
  disabled={!!lead.opt_out}
  {send}
  sent={() => refresh().catch(report)}
>
  {#snippet hint()}<Icon name="lock" /> Replying takes over from AI.{/snippet}
</Composer>
