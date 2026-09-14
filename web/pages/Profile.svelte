<script lang="ts">
  import { ui, navigate, run, refresh, notify } from '../lib/workspace.svelte.ts';
  import { api, post } from '../lib/api.ts';
  import type { Appointment, Availability } from '../lib/types.ts';
  import { dateTime } from '../lib/format.ts';
  import Heading from '../components/Heading.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  import Empty from '../components/Empty.svelte';
  import Fields from '../components/Fields.svelte';
  import Score from '../components/Score.svelte';
  import LeadControls from '../components/LeadControls.svelte';
  let tab = $state('timeline');
  let lead = $derived(ui.profile);
  async function move(appointment: Appointment) {
    await run(async () => {
      const data = await api<Availability>(`/appointments/${appointment.id}/availability`);
      ui.modal = { kind: 'reschedule', appointment, ...data };
    });
  }
</script>

{#if lead}
  <Heading title={lead.name} description={`${lead.email || lead.phone || ''} · ${lead.source}`}
    ><button class="btn" onclick={() => navigate('/')}><Icon name="back" /> Conversations</button
    ></Heading
  >
  <div class="profile-grid">
    <section class="panel">
      <div class="between">
        <div class="row">
          <Badge value={lead.stage} /><Badge value={lead.category} />{#if lead.opt_out}<Badge
              value="Stopped"
            />{/if}
        </div>
        <button
          class="btn"
          onclick={() => {
            if (lead) ui.modal = { kind: 'stage', lead };
          }}>Change stage</button
        >
      </div>
      <div class="tabs form-footer">
        {#each [['timeline', 'Timeline'], ['data', 'Data'], ['score', 'Score'], ['appointments', 'Meetings']] as [key, label] (key)}<button
            class="tab"
            class:active={tab === key}
            aria-pressed={tab === key}
            onclick={() => {
              tab = key;
            }}>{label}</button
          >{/each}
      </div>
      {#if tab === 'data'}<Fields {lead} />
        <div class="form-footer">
          <button
            class="btn primary"
            onclick={() => {
              if (lead) ui.modal = { kind: 'fields', lead };
            }}><Icon name="edit" /> Edit fields</button
          >
        </div>
        <hr class="form-divider" />
        <h3>Field history</h3>
        {#each lead.revisions as revision (revision.id)}<div class="timeline-item">
            <span class="timeline-dot"></span>
            <div>
              <p>{revision.field} {revision.proposed ? '· Proposed conflict' : ''}</p>
              <small
                >{revision.old_value} → {revision.new_value} · {dateTime(revision.created_at)}
                {revision.locked ? '· Locked' : ''}</small
              >
            </div>
          </div>{:else}<p class="muted small">No field revisions yet.</p>{/each}
      {:else if tab === 'score'}<Score {lead} />
        <div class="form-footer">
          <button
            class="btn"
            disabled={ui.busy}
            onclick={() =>
              run(async () => {
                await post(`/leads/${lead?.id}/recalculate`);
                notify('Recalculated using the latest published rules');
                await refresh();
              })}>Recalculate with latest rules</button
          >
        </div>
        <hr class="form-divider" />
        <h3>Evaluation history</h3>
        {#each lead.evaluations as evaluation (evaluation.id)}<div class="timeline-item">
            <span class="timeline-dot"></span>
            <div>
              <p>{evaluation.score}/100 · {evaluation.category}</p>
              <small>{dateTime(evaluation.created_at)}</small>
            </div>
          </div>{/each}
      {:else if tab === 'appointments'}{#each lead.appointments as appointment (appointment.id)}<section
            class="context-section"
          >
            <div class="between">
              <h3>{dateTime(appointment.start_at, false, appointment.timezone)}</h3>
              <Badge value={appointment.status} />
            </div>
            <p class="muted small">
              {appointment.timezone} · {ui.meta?.providers.calendar} calendar
            </p>
            <p class="mono muted">
              {appointment.external_id || 'Waiting for calendar confirmation'}
            </p>
            {#if appointment.external_url && /^https?:\/\//.test(appointment.external_url)}<a
                class="link small"
                href={appointment.external_url}
                target="_blank"
                rel="noopener">Open calendar event ↗</a
              >{/if}{#if appointment.status === 'confirmed'}<div class="form-footer">
                <button class="btn" disabled={ui.busy} onclick={() => move(appointment)}
                  >Reschedule</button
                ><button
                  class="btn danger"
                  onclick={() => {
                    ui.modal = { kind: 'cancel', appointment };
                  }}>Cancel appointment</button
                >
              </div>{/if}
          </section>{:else}<Empty
            title="No appointment yet"
            description="A qualified visitor can choose a time in their chat."
          />{/each}
      {:else}{#each lead.timeline as event (event.id)}<div class="timeline-item">
            <span class="timeline-dot"></span>
            <div class="flex">
              <div class="between">
                <p>{event.action.replaceAll('_', ' ')}</p>
                <small>{dateTime(event.created_at)}</small>
              </div>
              <small class="mono">{event.correlation_id}</small>
              <pre>{JSON.stringify(event.details, null, 2)}</pre>
            </div>
          </div>{/each}{/if}
    </section>
    <aside class="stack">
      <section class="panel">
        <div class="section-title">Conversation control</div>
        <div class="stack">
          <div class="between">
            <span class="small muted">Owner</span><Badge value={lead.owner} />
          </div>
          <LeadControls {lead} />{#if lead.opt_out && ui.user?.role === 'admin'}<button
              class="btn danger"
              onclick={() => {
                if (lead) ui.modal = { kind: 'restore-consent', lead };
              }}>Restore consent separately</button
            >{/if}{#if lead.review_reason}<div class="attention">
              {lead.review_reason.replaceAll('_', ' ')}
            </div>{/if}
        </div>
      </section>
      <section class="panel">
        <div class="section-title">
          Team notes<button
            class="icon-btn"
            title="Add note"
            onclick={() => {
              if (lead) ui.modal = { kind: 'note', lead };
            }}><Icon name="plus" /></button
          >
        </div>
        {#each lead.notes as note (note.id)}<div class="timeline-item">
            <div>
              <p class="email-body">{note.body}</p>
              <small>{dateTime(note.created_at)}</small>
            </div>
          </div>{:else}<p class="small muted">Private notes stay with your team.</p>{/each}
      </section>
      {#if lead.handoffs.length}<section class="panel">
          <h3>Handoff summary</h3>
          <p class="small muted email-body">{lead.handoffs[0].summary}</p>
        </section>{/if}
    </aside>
  </div>
{/if}
