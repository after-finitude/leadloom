<script lang="ts">
  import type { Lead } from '../lib/types.ts';
  let { lead }: { lead: Pick<Lead, 'opt_out' | 'paused' | 'owner'> } = $props();
</script>

{lead.opt_out
  ? 'Opted out'
  : lead.paused
    ? 'Paused'
    : lead.owner === 'AI'
      ? 'AI assistant'
      : 'Team member'}
