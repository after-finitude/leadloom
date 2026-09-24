<script lang="ts">
  import { onMount } from 'svelte';
  import { ui, run, busy } from '../lib/workspace.svelte.ts';
  import { resource } from '../lib/resource.svelte.ts';
  import type { OutboxMessage } from '../lib/types.ts';
  import { dateTime } from '../lib/format.ts';
  import Heading from '../components/Heading.svelte';
  import Icon from '../components/Icon.svelte';
  const outbox = resource<OutboxMessage[]>('/outbox');
  onMount(outbox.mount);
</script>

<Heading
  title="Demo email outbox"
  description="Preview the exact email payload. These messages were saved locally, not delivered."
  ><button class="btn" disabled={busy('outbox')} onclick={() => run('outbox', outbox.load)}
    ><Icon name="refresh" /> Refresh</button
  ></Heading
>
{#if outbox.error}<p class="attention" role="alert">{outbox.error}</p>{:else if !outbox.data}<p
    class="muted"
    role="status"
  >
    Loading emails…
  </p>{:else}<div class="panel slim">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Recipient</th><th>Subject</th><th>Saved at</th><th>Preview</th></tr></thead
        ><tbody
          >{#each outbox.data as email (email.id)}<tr
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
