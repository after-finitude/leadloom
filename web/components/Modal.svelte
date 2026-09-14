<script lang="ts">
  import { onMount } from 'svelte';
  import type { Modal, LeadFields } from '../lib/types.ts';
  import { api, post, pendingKey, clearPending, ApiError, errorMessage } from '../lib/api.ts';
  import { ui, submit, run, refresh, notify } from '../lib/workspace.svelte.ts';
  import { value } from '../lib/format.ts';
  import Field from './Field.svelte';
  import Icon from './Icon.svelte';
  let { modal }: { modal: Modal } = $props();
  let dialog: HTMLDialogElement;
  let error = $state('');
  let budgetError = $state('');
  const titles = {
    fields: 'Project details',
    stage: 'Change deal stage',
    note: 'Add a private team note',
    'return-to-ai': 'Resolve review and return to AI',
    'restore-consent': 'Restore automation consent',
    cancel: 'Cancel consultation',
    reschedule: 'Choose a new consultation time',
    resolve: 'Resolve contact conflict',
    email: 'Mock email preview'
  };
  const editable = [
    'service_type',
    'location',
    'budget_min',
    'budget_max',
    'timeline',
    'decision_maker',
    'preferred_contact'
  ] as const;
  onMount(() => {
    dialog.showModal();
  });
  function close() {
    if (!ui.busy) ui.modal = null;
  }
  async function done(message: string) {
    ui.modal = null;
    ui.changeCount++;
    notify(message);
    await refresh().catch((cause) =>
      notify(`Saved, but the view could not refresh: ${errorMessage(cause)}`, true)
    );
  }
  async function save(event: SubmitEvent) {
    error = '';
    budgetError = '';
    await submit(
      event,
      async (data) => {
        if (modal.kind === 'fields') {
          const changed: Record<string, string | number | boolean | null> = {},
            unlock: (keyof LeadFields)[] = [];
          for (const field of editable) {
            const raw = value(data, field),
              next =
                raw === ''
                  ? null
                  : ['budget_min', 'budget_max', 'timeline'].includes(field)
                    ? Number(raw)
                    : field === 'decision_maker'
                      ? raw === 'true'
                      : raw;
            if (JSON.stringify(modal.lead.fields[field] ?? null) !== JSON.stringify(next))
              changed[field] = next;
            if (data.has(`unlock_${field}`)) unlock.push(field);
          }
          await api(`/leads/${modal.lead.id}`, {
            method: 'PATCH',
            body: { fields: changed, locked: data.has('locked'), unlock }
          });
          await done('Project details saved');
        } else if (modal.kind === 'stage') {
          await post(`/leads/${modal.lead.id}/stage`, {
            stage: value(data, 'stage'),
            reason: value(data, 'reason')
          });
          await done('Deal stage updated');
        } else if (modal.kind === 'note') {
          await post(`/leads/${modal.lead.id}/notes`, { body: value(data, 'body') });
          await done('Private note saved');
        } else if (modal.kind === 'return-to-ai' || modal.kind === 'restore-consent') {
          await post(`/leads/${modal.lead.id}/${modal.kind}`, {
            reason: value(data, 'reason'),
            confirmed: data.has('confirmed')
          });
          await done('Conversation control updated');
        } else if (modal.kind === 'cancel') {
          const scope = `cancel:${modal.appointment.id}`;
          await post(`/appointments/${modal.appointment.id}/cancel`, {
            key: pendingKey(scope, modal.appointment.id)
          });
          clearPending(scope);
          await done('Cancellation request saved');
        } else if (modal.kind === 'resolve') {
          await post(`/intake-events/${modal.eventId}/resolve`, {
            contactId: value(data, 'contactId')
          });
          await done('Intake resolution saved');
        }
      },
      (cause) => {
        if (cause instanceof ApiError && cause.code === 'invalid_budget')
          budgetError = errorMessage(cause);
        else error = errorMessage(cause);
      }
    );
  }
  async function reschedule(offerId: string) {
    if (modal.kind !== 'reschedule') return;
    error = '';
    const appointmentId = modal.appointment.id;
    await run(
      async () => {
        const scope = `reschedule:${appointmentId}`;
        await post(`/appointments/${appointmentId}/reschedule`, {
          offerId,
          key: pendingKey(scope, offerId)
        });
        clearPending(scope);
        await done('Reschedule request saved; awaiting calendar confirmation');
      },
      (cause) => {
        error = errorMessage(cause);
      }
    );
  }
</script>

<dialog
  bind:this={dialog}
  class="modal"
  class:wide={modal.kind === 'email'}
  aria-labelledby="modal-title"
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  onclose={close}
>
  <div class="modal-head">
    <h2 id="modal-title">{titles[modal.kind]}</h2>
    <button
      class="icon-btn"
      type="button"
      aria-label="Close dialog"
      disabled={ui.busy}
      onclick={close}><Icon name="close" /></button
    >
  </div>
  <div class="modal-body">
    {#if error}<p class="form-error" role="alert">
        {error}
      </p>{/if}{#if modal.kind === 'email'}<p class="small muted">
        To {modal.email.payload.to} · Saved locally, not delivered
      </p>
      <h3 class="faq-item">{modal.email.payload.subject}</h3>
      <pre>{modal.email.payload.text}</pre>
      <div class="form-footer">
        {#each modal.email.payload.text.match(/https?:\/\/\S+/g) || [] as url, i (i)}<a
            class="btn"
            class:primary={i === 0}
            href={url}
            target="_blank"
            rel="noopener">{i ? 'Open unsubscribe' : 'Open secure chat'} <Icon name="arrow" /></a
          >{/each}
      </div>
    {:else if modal.kind === 'reschedule'}<p class="small muted">
        {modal.timezone} · The current booking stays active until this change is confirmed.
      </p>
      <div class="slot-grid">
        {#each modal.slots || [] as slot (slot.id)}<button
            class="slot-button"
            disabled={ui.busy}
            onclick={() => reschedule(slot.id)}>{slot.label}</button
          >{:else}<p>No free times in the current search window.</p>{/each}
      </div>
    {:else}<form onsubmit={save}>
        {#if modal.kind === 'fields'}
          <p class="small muted">
            Edits are locked by default. AI will flag conflicting answers instead of overwriting
            your values.
          </p>
          <div class="form-grid faq-item">
            <Field
              label="Service"
              name="service_type"
              value={modal.lead.fields.service_type}
            /><Field
              label="City / postcode"
              name="location"
              value={modal.lead.fields.location}
            /><Field
              label="Budget minimum"
              name="budget_min"
              type="number"
              min={0}
              max={1000000000}
              value={modal.lead.fields.budget_min}
            /><Field
              label="Budget maximum"
              name="budget_max"
              type="number"
              min={0}
              max={1000000000}
              error={budgetError}
              value={modal.lead.fields.budget_max}
            /><Field
              label="Timeline upper bound (months)"
              name="timeline"
              type="number"
              min={0}
              max={1200}
              value={modal.lead.fields.timeline}
            />
            <div class="field">
              <label for="decision-maker">Decision maker</label><select
                id="decision-maker"
                name="decision_maker"
                value={modal.lead.fields.decision_maker == null
                  ? ''
                  : String(modal.lead.fields.decision_maker)}
                ><option value="">Unknown</option><option value="true">Yes</option><option
                  value="false">No</option
                ></select
              >
            </div>
            <div class="field">
              <label for="preferred-contact">Preferred contact</label><select
                id="preferred-contact"
                name="preferred_contact"
                value={modal.lead.fields.preferred_contact || ''}
                ><option value="">Unknown</option
                >{#each ['chat', 'email', 'phone'] as contact (contact)}<option>{contact}</option
                  >{/each}</select
              >
            </div>
          </div>
          <label class="check-row"
            ><input type="checkbox" name="locked" checked />Lock changed fields against AI
            overwrites</label
          >{#each editable.filter((field) => modal.kind === 'fields' && modal.lead.meta[field]?.locked) as field (field)}<label
              class="check-row"
              ><input type="checkbox" name={`unlock_${field}`} />Unlock {field.replaceAll(
                '_',
                ' '
              )}</label
            >{/each}
        {:else if modal.kind === 'stage'}<div class="field">
            <label for="stage">Stage</label><select id="stage" name="stage" value={modal.lead.stage}
              >{#each ['New', 'Contacted', 'Qualified', 'Booked', 'Proposal', 'Won', 'Lost'] as stage (stage)}<option
                  >{stage}</option
                >{/each}</select
            >
          </div>
          <div class="field">
            <label for="reason">Reason (required for Lost)</label><textarea
              id="reason"
              name="reason"></textarea>
          </div>
        {:else if modal.kind === 'note'}<div class="field">
            <label for="note">Note</label><textarea id="note" name="body" required maxlength="4000"
            ></textarea>
          </div>
        {:else if modal.kind === 'return-to-ai'}<div class="attention">
            {modal.lead.review_reason?.replaceAll('_', ' ')}
          </div>
          <div class="field">
            <label for="reason">Resolution notes</label><textarea
              id="reason"
              name="reason"
              required
              minlength="3"
              placeholder="Explain how this review was resolved"></textarea>
          </div>
          <p class="small muted">This does not remove a pause or restore opt-out consent.</p>
        {:else if modal.kind === 'restore-consent'}<p class="small muted">
            Record the contact’s new explicit consent. This does not automatically return ownership
            to AI or restart old follow-ups.
          </p>
          <div class="field">
            <label for="reason">Evidence / reason</label><textarea
              id="reason"
              name="reason"
              required></textarea>
          </div>
          <label class="check-row"
            ><input type="checkbox" name="confirmed" required />I have verified renewed consent.</label
          >
        {:else if modal.kind === 'cancel'}<p class="muted small">
            The existing appointment remains confirmed until the calendar acknowledges cancellation.
            Follow-ups will not restart automatically.
          </p>
        {:else if modal.kind === 'resolve'}<p class="small muted">
            Select the correct existing contact after checking the original source. Existing trusted
            email and phone details will not be overwritten.
          </p>
          <div class="field">
            <label for="contact">Correct contact</label><select
              id="contact"
              name="contactId"
              required
              >{#each modal.contacts as contact (contact.id)}<option value={contact.id}
                  >{contact.name} — {contact.email || contact.phone || ''}</option
                >{/each}</select
            >
          </div>{/if}
        <div class="form-footer">
          <button class="btn" type="button" disabled={ui.busy} onclick={close}
            >{modal.kind === 'cancel' ? 'Keep appointment' : 'Cancel'}</button
          ><button class="btn primary" class:danger={modal.kind === 'cancel'} disabled={ui.busy}
            >{{
              fields: 'Save changes',
              stage: 'Update stage',
              note: 'Save note',
              'return-to-ai': 'Resolve and return to AI',
              'restore-consent': 'Record renewed consent',
              cancel: 'Confirm cancellation',
              resolve: 'Resolve intake'
            }[modal.kind]}</button
          >
        </div>
      </form>{/if}
  </div>
</dialog>
