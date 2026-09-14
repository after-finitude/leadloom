<script lang="ts">
  import { ui, run, notify, navigate } from '../lib/workspace.svelte.ts';
  import { api, post } from '../lib/api.ts';
  import type { Runs, Contact } from '../lib/types.ts';
  import { dateTime } from '../lib/format.ts';
  import Heading from '../components/Heading.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  let data = $state<Runs | null>(null);
  let error = $state('');
  async function load() {
    data = await api<Runs>('/runs');
    error = '';
  }
  $effect(() => {
    void ui.changeCount;
    let active = true;
    api<Runs>('/runs')
      .then((result) => {
        if (active) data = result;
      })
      .catch((e) => {
        if (active) error = e.message;
      });
    return () => {
      active = false;
    };
  });
  async function reconcile(id: string) {
    await run(async () => {
      const result = await post<{ state: string }>(`/operations/${id}/reconcile`);
      notify(
        result.state === 'confirmed'
          ? 'External result confirmed'
          : 'Result still uncertain. No blind resend was made.'
      );
      await load();
    });
  }
  async function retry(id: string) {
    await run(async () => {
      await post(`/runs/${id}/retry`);
      notify('Safe retry queued');
      await load();
    });
  }
  async function resolve(eventId: string) {
    await run(async () => {
      const contacts = await api<Contact[]>('/contacts');
      ui.modal = { kind: 'resolve', eventId, contacts };
    });
  }
</script>

<Heading
  title="Execution log"
  description="What happened, what is waiting, and what needs a closer look."
  ><button class="btn" disabled={ui.busy} onclick={() => run(load)}
    ><Icon name="refresh" /> Refresh</button
  ></Heading
>
{#if error}<p class="attention" role="alert">{error}</p>{:else if !data}<p
    class="muted"
    role="status"
  >
    Loading executions…
  </p>{/if}
{#if data}<div class="panel slim">
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Process</th><th>State</th><th>Lead</th><th>Attempts</th><th>Last update</th><th
              >Safe actions</th
            ></tr
          ></thead
        ><tbody
          >{#each data.actions as action (action.id)}<tr
              ><td
                ><strong>{action.kind}</strong>
                <div class="table-sub mono">{action.error_code || action.id.slice(0, 12)}</div></td
              ><td><Badge value={action.state} /></td><td
                >{#if action.lead_id}<button
                    class="link"
                    onclick={() => navigate('/leads/' + action.lead_id)}
                    >{ui.leads.find((l) => l.id === action.lead_id)?.name ||
                      action.lead_id.slice(0, 8)}</button
                  >{:else}—{/if}</td
              ><td>{action.attempts}</td><td class="small muted">{dateTime(action.updated_at)}</td
              ><td
                >{#if action.operation_state === 'unknown' && action.operation_id}<button
                    class="btn"
                    disabled={ui.busy}
                    onclick={() => reconcile(action.operation_id!)}>Reconcile</button
                  >{:else if action.state === 'failed' && ['turn', 'email', 'followup'].includes(action.kind)}<button
                    class="btn"
                    disabled={ui.busy}
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
          >{#each data.intake as event (event.id)}<tr
              ><td>{event.source}</td><td><Badge value={event.status} /></td><td class="small muted"
                >{event.reason || '—'}</td
              ><td class="mono">{event.correlation_id}</td><td
                >{#if event.status === 'needs_resolution'}<button
                    class="btn"
                    disabled={ui.busy}
                    onclick={() => resolve(event.id)}>Resolve</button
                  >{:else}—{/if}</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </div>{/if}
