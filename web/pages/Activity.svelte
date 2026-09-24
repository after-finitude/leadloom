<script lang="ts">
  import { ui, run, busy, notify, follow } from '../lib/workspace.svelte.ts';
  import { resource } from '../lib/resource.svelte.ts';
  import { api, post } from '../lib/api.ts';
  import type { Runs, Contact } from '../lib/types.ts';
  import { dateTime } from '../lib/format.ts';
  import Heading from '../components/Heading.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  const runs = resource<Runs>('/runs');
  $effect(() => {
    void ui.changeCount;
    return runs.mount();
  });
  async function reconcile(id: string) {
    await run('activity', async () => {
      const result = await post<{ state: string }>(`/operations/${id}/reconcile`);
      notify(
        result.state === 'confirmed'
          ? 'External result confirmed'
          : 'Result still uncertain. No blind resend was made.'
      );
      await runs.load();
    });
  }
  async function retry(id: string) {
    await run('activity', async () => {
      await post(`/runs/${id}/retry`);
      notify('Safe retry queued');
      await runs.load();
    });
  }
  async function resolve(eventId: string) {
    await run('activity', async () => {
      const contacts = await api<Contact[]>('/contacts');
      ui.modal = { kind: 'resolve', eventId, contacts };
    });
  }
</script>

<Heading
  title="Execution log"
  description="What happened, what is waiting, and what needs a closer look."
  ><button class="btn" disabled={busy('activity')} onclick={() => run('activity', runs.load)}
    ><Icon name="refresh" /> Refresh</button
  ></Heading
>
{#if runs.error}<p class="attention" role="alert">{runs.error}</p>{:else if !runs.data}<p
    class="muted"
    role="status"
  >
    Loading executions…
  </p>{/if}
{#if runs.data}<div class="panel slim">
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Process</th><th>State</th><th>Lead</th><th>Attempts</th><th>Last update</th><th
              >Safe actions</th
            ></tr
          ></thead
        ><tbody
          >{#each runs.data.actions as action (action.id)}<tr
              ><td
                ><strong>{action.kind}</strong>
                <div class="table-sub mono">{action.error_code || action.id.slice(0, 12)}</div></td
              ><td><Badge value={action.state} /></td><td
                >{#if action.lead_id}<a
                    class="link"
                    href={'/leads/' + action.lead_id}
                    onclick={follow}
                    >{ui.leads.find((l) => l.id === action.lead_id)?.name ||
                      action.lead_id.slice(0, 8)}</a
                  >{:else}—{/if}</td
              ><td>{action.attempts}</td><td class="small muted">{dateTime(action.updated_at)}</td
              ><td
                >{#if action.operation_state === 'unknown' && action.operation_id}<button
                    class="btn"
                    disabled={busy('activity')}
                    onclick={() => reconcile(action.operation_id!)}>Reconcile</button
                  >{:else if action.state === 'failed' && ['turn', 'email', 'followup'].includes(action.kind)}<button
                    class="btn"
                    disabled={busy('activity')}
                    onclick={() => retry(action.id)}>Retry safely</button
                  >{:else}<span class="small muted">—</span>{/if}</td
              ></tr
            >{:else}<tr><td colspan="6">No executions yet.</td></tr>{/each}</tbody
        >
      </table>
    </div>
  </div>
  <div class="panel">
    <h3>Incoming events</h3>
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Source</th><th>State</th><th>Reason</th><th>Correlation ID</th><th>Resolution</th
            ></tr
          ></thead
        ><tbody
          >{#each runs.data.intake as event (event.id)}<tr
              ><td>{event.source}</td><td><Badge value={event.status} /></td><td class="small muted"
                >{event.reason || '—'}</td
              ><td class="mono">{event.correlation_id}</td><td
                >{#if event.status === 'needs_resolution'}<button
                    class="btn"
                    disabled={busy('activity')}
                    onclick={() => resolve(event.id)}>Resolve</button
                  >{:else}—{/if}</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </div>{/if}
