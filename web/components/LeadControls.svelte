<script lang="ts">
  import type { Lead } from '../lib/types.ts';
  import { post } from '../lib/api.ts';
  import { ui, run, refresh, notify } from '../lib/workspace.svelte.ts';
  let { lead, compact = false }: { lead: Lead; compact?: boolean } = $props();
  async function control(command: string) {
    if (command === 'return-to-ai' && lead.review_reason) {
      ui.modal = { kind: 'return-to-ai', lead };
      return;
    }
    await run(async () => {
      await post(`/leads/${lead.id}/${command}`);
      notify('Conversation control updated');
      await refresh();
    });
  }
</script>

<button
  class="btn"
  disabled={ui.busy}
  onclick={() => control(lead.owner === 'AI' ? 'takeover' : 'return-to-ai')}
  >{lead.owner === 'AI' ? 'Take over' : 'Return to AI'}</button
>
<button
  class="btn"
  class:subtle={compact}
  disabled={ui.busy}
  onclick={() => control(lead.paused ? 'resume' : 'pause')}
  >{lead.paused ? 'Resume' : compact ? 'Pause' : 'Pause automation'}</button
>
