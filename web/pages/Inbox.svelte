<script lang="ts">
  import { ui, report, selectLead, follow } from '../lib/workspace.svelte.ts';
  import { initials, dateTime } from '../lib/format.ts';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import Empty from '../components/Empty.svelte';
  import LeadTools from '../components/LeadTools.svelte';
  import Pagination from '../components/Pagination.svelte';
  import Conversation from '../components/Conversation.svelte';
  import LeadControls from '../components/LeadControls.svelte';
  import Fields from '../components/Fields.svelte';
  import Score from '../components/Score.svelte';
  import OwnerLabel from '../components/OwnerLabel.svelte';
  import AppointmentCard from '../components/AppointmentCard.svelte';
  let lead = $derived(ui.profile);
  let appointment = $derived(
    lead?.appointments.find((a) => ['confirmed', 'pending', 'unknown'].includes(a.status))
  );
</script>

<div class="inbox" id="inbox" class:has-selection={!!ui.leadId}>
  <aside class="conversation-list" aria-label="Conversations">
    <LeadTools compact />
    <div class="list-scroll" aria-busy={ui.loading}>
      {#each ui.leads as item (item.id)}
        <button
          class="lead-card"
          class:active={ui.leadId === item.id}
          aria-current={ui.leadId === item.id ? 'true' : undefined}
          onclick={() => selectLead(item.id).catch(report)}
        >
          <div class="avatar">{initials(item.name)}</div>
          <div class="lead-card-content">
            <div class="between">
              <strong>{item.name}</strong><time>{dateTime(item.updated_at, true)}</time>
            </div>
            <p class="lead-preview">{item.last_message?.body || 'New enquiry'}</p>
            <div class="lead-meta">
              <span class="owner-mini"><OwnerLabel lead={item} /></span>
              <Badge
                value={item.stage === 'Booked'
                  ? 'Booked'
                  : item.review_reason && !item.opt_out
                    ? 'Human'
                    : item.category}
              />
            </div>
          </div>
        </button>
      {:else}
        <Empty
          title="No matching conversations"
          description="Try a different search or filter, or start a new enquiry."
        />
      {/each}
    </div>
    <Pagination />
  </aside>
  <section class="chat-panel" id="chat-panel" aria-label="Selected conversation">
    {#if lead}
      {#key lead.id}<Conversation {lead} />{/key}
    {:else}
      <Empty
        title={ui.loadingProfile ? 'Loading conversation…' : 'Select a conversation'}
        description="Choose an enquiry to read messages and reply."
      />
    {/if}
  </section>
</div>

<aside class="inbox-details" id="conversation-details" popover="auto" aria-label="Lead details">
  {#if lead}
    <header class="details-heading">
      <h2>Lead details</h2>
      <button
        class="icon-btn"
        aria-label="Close lead details"
        popovertarget="conversation-details"
        popovertargetaction="hide"><Icon name="close" /></button
      >
    </header>
    <section class="context-section">
      <div class="details-contact">
        <h3>{lead.name}</h3>
        <Badge value={lead.stage} />
      </div>
      <p class="small muted">{lead.email || lead.phone || 'No contact details'}</p>
      <a class="btn details-profile" href={'/leads/' + lead.id} onclick={follow}
        >Open lead <Icon name="arrow" /></a
      >
    </section>
    <section class="context-section">
      <h3 class="section-title">Conversation control</h3>
      <p class="small muted">
        {lead.owner === 'AI' ? 'AI assistant' : 'Team member'}{lead.paused
          ? ' · Automation paused'
          : ''}
      </p>
      <div class="details-controls"><LeadControls {lead} /></div>
    </section>
    <section class="context-section">
      <div class="section-title">
        Project details<button
          class="icon-btn"
          title="Edit qualification fields"
          onclick={() => {
            if (lead) ui.modal = { kind: 'fields', lead };
          }}><Icon name="edit" /></button
        >
      </div>
      <Fields {lead} />
    </section>
    <section class="context-section">
      <h3 class="section-title">Lead qualification</h3>
      <Score {lead} />
    </section>
    <section class="context-section">
      <h3 class="section-title">Consultation</h3>
      {#if appointment}
        <AppointmentCard {appointment} calendar={ui.meta?.providers.calendar} />
      {:else}<p class="empty-small">No consultation booked yet.</p>{/if}
    </section>
    <section class="context-section">
      <h3 class="section-title">Next action</h3>
      <p class="empty-small">
        {lead.next_action
          ? `${lead.next_action.kind.replaceAll('_', ' ')} · ${dateTime(lead.next_action.due_at)}`
          : lead.opt_out
            ? 'No outreach — contact opted out'
            : lead.owner === 'HUMAN'
              ? 'Waiting for a team member'
              : 'Waiting for the visitor'}
      </p>
    </section>
    <section class="context-section">
      <h3 class="section-title">First contact</h3>
      <p class="empty-small">
        {lead.first_contact_ms != null
          ? `${lead.first_contact_ms} ms · ${lead.first_contact_channel} · ${lead.first_contact_ms < 10000 ? 'Within target' : 'Over target'}`
          : lead.first_contact_status}
      </p>
    </section>
  {/if}
</aside>
