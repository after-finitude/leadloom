<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api.ts';
  import { ui, run } from '../lib/workspace.svelte.ts';
  import type { OutboxMessage } from '../lib/types.ts';
  import { dateTime } from '../lib/format.ts';
  import Heading from '../components/Heading.svelte';
  import Icon from '../components/Icon.svelte';
  let messages = $state<OutboxMessage[]>([]),
    loaded = $state(false),
    error = $state('');
  async function load() {
    messages = await api<OutboxMessage[]>('/outbox');
    loaded = true;
    error = '';
  }
  onMount(() => {
    let active = true;
    api<OutboxMessage[]>('/outbox')
      .then((data) => {
        if (active) {
          messages = data;
          loaded = true;
        }
      })
      .catch((e) => {
        if (active) error = e.message;
      });
    return () => {
      active = false;
    };
  });
</script>

<Heading
  title="Demo email outbox"
  description="Preview the exact email payload. These messages were saved locally, not delivered."
  ><button class="btn" disabled={ui.busy} onclick={() => run(load)}
    ><Icon name="refresh" /> Refresh</button
  ></Heading
>
{#if error}<p class="attention" role="alert">{error}</p>{:else if !loaded}<p
    class="muted"
    role="status"
  >
    Loading emails…
  </p>{:else}<div class="panel slim">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Recipient</th><th>Subject</th><th>Saved at</th><th>Preview</th></tr></thead
        ><tbody
          >{#each messages as email (email.id)}<tr
              ><td>{email.payload.to}</td><td>{email.payload.subject}</td><td
                >{dateTime(email.created_at)}</td
              ><td
                ><button
                  class="btn"
                  onclick={() => {
                    ui.modal = { kind: 'email', email };
                  }}>Preview</button
                ></td
              ></tr
            >{:else}<tr
              ><td colspan="4"
                >No mock emails yet. Send an authenticated webhook to test invitation delivery.</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </div>{/if}
